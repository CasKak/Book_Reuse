# -*- coding: utf-8 -*-
"""迁移 SQL 静态审查：把常用的 SQL 缺陷查在前面。

无法替代真实数据库执行，但能在没有 Postgres 的环境下拦住大部分低级错误：
  1. 统计表 / 枚举 / 策略数量是否与设计一致
  2. 检查 RLS：每张业务表是否都 enable + force，是否至少有一条策略
  3. 检查权限：是否对只增不改的表误授了写权限
  4. 检查外键引用顺序（被引用的表必须先创建）
  5. 检查块注释中是否误含 */ 导致语法提前闭合
  6. 检查 gen_random_uuid 等扩展函数的 schema 引用一致性

用法：python tools/check_migrations.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

MIGRATIONS_DIR = Path("supabase/migrations")

# 设计基线（见 docs/data-model.md）
EXPECTED_TABLES = {
    # A 组
    "schools", "majors", "courses", "profiles", "user_addresses",
    # B 组
    "book_categories", "books", "listings", "orders", "order_items",
    "recycle_requests", "rentals", "donations",
    # C 组
    "carbon_records", "user_coupons", "campaigns",
    # D 组
    "smart_lockers", "locker_usage_logs", "condition_images",
    # E 组
    "pricing_rules", "sensitivity_analysis", "cashflow_forecast",
    # F 组
    "notifications", "audit_logs",
}

EXPECTED_ENUMS = {
    "user_role", "verify_status", "book_condition", "listing_type", "listing_status",
    "order_type", "order_status", "payment_method", "delivery_method", "recycle_status",
    "carbon_action", "coupon_status", "locker_status", "locker_event",
    "notification_type", "audit_action",
}   # 共 16 个（文档中早期写作 15，以实际迁移为准）

# 只增不改的表：不得对 authenticated 授予 INSERT/UPDATE/DELETE
APPEND_ONLY_TABLES = {"carbon_records", "user_coupons", "locker_usage_logs", "audit_logs"}

# 仅运营/管理员可见的表
STAFF_ONLY_TABLES = {"pricing_rules", "sensitivity_analysis", "cashflow_forecast"}

problems: list[str] = []
notes: list[str] = []


def read_all() -> dict[str, str]:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        problems.append(f"未找到任何迁移文件：{MIGRATIONS_DIR}")
    return {f.name: f.read_text(encoding="utf-8") for f in files}


def strip_comments(sql: str) -> str:
    """去掉 -- 行注释与 /* */ 块注释，避免注释内容干扰统计。"""
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", "", sql)
    return sql


def main() -> int:
    sources = read_all()
    if not sources:
        return 1

    print("=" * 74)
    print("迁移 SQL 静态审查")
    print("=" * 74)
    print(f"迁移文件：{len(sources)} 个")
    for name in sources:
        print(f"  · {name}")

    joined_raw = "\n".join(sources.values())
    joined = strip_comments(joined_raw)

    # ---------------- 1. 表数量 ----------------
    print()
    print("-" * 74)
    print("1) 表定义")
    created = set(re.findall(r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)",
                             joined, re.I))
    print(f"  定义表数：{len(created)}（设计基线 {len(EXPECTED_TABLES)}）")

    missing = EXPECTED_TABLES - created
    extra = created - EXPECTED_TABLES
    if missing:
        problems.append(f"缺少表定义：{', '.join(sorted(missing))}")
    if extra:
        notes.append(f"额外的表（不在设计基线内）：{', '.join(sorted(extra))}")

    # ---------------- 2. 枚举数量 ----------------
    print()
    print("-" * 74)
    print("2) 枚举定义")
    enums = set(re.findall(r"create\s+type\s+public\.(\w+)\s+as\s+enum", joined, re.I))
    print(f"  定义枚举数：{len(enums)}（设计基线 {len(EXPECTED_ENUMS)}）")
    miss_e = EXPECTED_ENUMS - enums
    extra_e = enums - EXPECTED_ENUMS
    if miss_e:
        problems.append(f"缺少枚举：{', '.join(sorted(miss_e))}")
    if extra_e:
        notes.append(f"额外的枚举：{', '.join(sorted(extra_e))}")

    # ---------------- 3. RLS 启用情况 ----------------
    print()
    print("-" * 74)
    print("3) RLS 启用与策略覆盖")
    enabled = set(re.findall(r"alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security",
                             joined, re.I))
    forced = set(re.findall(r"alter\s+table\s+public\.(\w+)\s+force\s+row\s+level\s+security",
                            joined, re.I))
    policies: dict[str, int] = {}
    for _name, tbl in re.findall(r"create\s+policy\s+(\w+)\s+on\s+public\.(\w+)", joined, re.I):
        policies[tbl] = policies.get(tbl, 0) + 1

    no_rls = created - enabled
    no_force = created - forced
    no_policy = {t for t in created if policies.get(t, 0) == 0}

    print(f"  启用 RLS：{len(enabled)}/{len(created)}")
    print(f"  启用 FORCE：{len(forced)}/{len(created)}")
    print(f"  策略总数：{sum(policies.values())} 条，覆盖 {len(policies)} 张表")

    if no_rls:
        problems.append(f"未启用 RLS 的表：{', '.join(sorted(no_rls))}")
    if no_force:
        problems.append(f"未启用 FORCE RLS 的表：{', '.join(sorted(no_force))}")
    # 只增不改的表本就无需策略（靠「无策略即拒绝」），单独说明
    append_only_no_policy = no_policy & APPEND_ONLY_TABLES
    real_no_policy = no_policy - APPEND_ONLY_TABLES
    if append_only_no_policy:
        notes.append(
            "以下只增不改的表无任何策略（依赖「无策略即拒绝」，写入仅靠 service_role）："
            + ", ".join(sorted(append_only_no_policy))
        )
    if real_no_policy:
        problems.append(f"没有任何 RLS 策略的表：{', '.join(sorted(real_no_policy))}")

    # ---------------- 4. 只增不改表的权限 ----------------
    print()
    print("-" * 74)
    print("4) 只增不改表的写权限")
    for tbl in sorted(APPEND_ONLY_TABLES):
        # 查找对该表的 grant 语句
        pat = re.compile(r"grant\s+([^;]*?)\s+on\s+([^;]*?)\b" + tbl + r"\b([^;]*?);",
                         re.I | re.S)
        bad = False
        for m in pat.finditer(joined):
            privs = m.group(1).lower()
            targets = (m.group(2) + " " + m.group(3)).lower()
            if "authenticated" in targets and re.search(r"\b(insert|update|delete|all)\b", privs):
                bad = True
        status = "存在误授写权限" if bad else "未授予写权限"
        print(f"  {tbl}: {status}")
        if bad:
            problems.append(f"{tbl} 对 authenticated 误授了写权限（该表应只增不改）")

    # ---------------- 5. 仅运营可见表不得授予 anon ----------------
    print()
    print("-" * 74)
    print("5) 商业机密表不得对匿名开放")
    for tbl in sorted(STAFF_ONLY_TABLES):
        pat = re.compile(r"grant\s+[^;]*?on\s+[^;]*?\b" + tbl + r"\b[^;]*?;", re.I | re.S)
        leaked = any("anon" in m.group(0).lower() for m in pat.finditer(joined))
        print(f"  {tbl}: {'⚠️ 对 anon 授予了权限' if leaked else '仅登录用户'}")
        if leaked:
            problems.append(f"{tbl} 不应授予 anon 任何权限")

    # ---------------- 6. 外键引用顺序 ----------------
    print()
    print("-" * 74)
    print("6) 外键引用顺序（被引用表须先创建）")
    order: list[str] = []
    for name in sorted(sources):
        body = strip_comments(sources[name])
        order.extend(re.findall(r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)",
                                body, re.I))

    created_so_far: set[str] = set()
    order_issues: list[str] = []
    for name in sorted(sources):
        body = strip_comments(sources[name])
        # 本文件内新增的表
        for ref in re.findall(r"references\s+public\.(\w+)", body, re.I):
            if ref not in created_so_far and ref not in re.findall(
                    r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)", body, re.I):
                order_issues.append(f"{name}: 引用了尚未创建的表 {ref}")
        created_so_far.update(
            re.findall(r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)", body, re.I))

    if order_issues:
        for issue in order_issues:
            problems.append(issue)
            print(f"  ⚠️ {issue}")
    else:
        print("  通过：所有外键引用的表均已先创建")

    # ---------------- 7. 块注释闭合检查 ----------------
    print()
    print("-" * 74)
    print("7) 块注释完整性")
    comment_issues = []
    for name, body in sources.items():
        # 逐行扫描：在 /** ... */ 内若再次出现 */ 位置异常，或奇数个 */ 都视为可疑
        opens = len(re.findall(r"/\*", body))
        closes = len(re.findall(r"\*/", body))
        if opens != closes:
            comment_issues.append(f"{name}: /* 出现 {opens} 次，*/ 出现 {closes} 次，不成对")
    if comment_issues:
        for issue in comment_issues:
            problems.append(issue)
            print(f"  ⚠️ {issue}")
    else:
        print("  通过：块注释标记成对")

    # ---------------- 8. 扩展函数引用 ----------------
    print()
    print("-" * 74)
    print("8) 扩展函数引用")
    checks = {
        "gen_random_uuid": len(re.findall(r"\bgen_random_uuid\(\)", joined)),
        "crypt": len(re.findall(r"\bcrypt\(", joined)),
        "gin_trgm_ops": len(re.findall(r"gin_trgm_ops", joined)),
    }
    for fn, cnt in checks.items():
        print(f"  {fn}: 使用 {cnt} 次")
    if checks["gin_trgm_ops"] and "extensions.gin_trgm_ops" not in joined:
        problems.append("gin_trgm_ops 未限定 schema，可能因 search_path 解析失败")
    if checks["crypt"] and "pgcrypto" not in joined:
        problems.append("使用了 crypt() 但未创建 pgcrypto 扩展")

    # ---------------- 9. 危险语句扫描 ----------------
    print()
    print("-" * 74)
    print("9) 危险语句扫描")
    dangers = {
        "drop database": r"drop\s+database",
        "drop schema": r"drop\s+schema",
        "truncate": r"\btruncate\b",
        "disable row level security": r"disable\s+row\s+level\s+security",
        "无 where 的 delete": r"delete\s+from\s+\w+\s*;",
        "无 where 的 update": r"update\s+\w+\s+set[^;]*?\s*;",
    }
    found_danger = False
    for label, pat in dangers.items():
        hits = re.findall(pat, joined, re.I)
        if hits:
            found_danger = True
            print(f"  ⚠️ {label}: {len(hits)} 处")
            problems.append(f"迁移中出现危险语句：{label}（{len(hits)} 处）")
    if not found_danger:
        print("  通过：未发现危险语句")

    # ---------------- 汇总 ----------------
    print()
    print("=" * 74)
    if notes:
        print("提示：")
        for n in notes:
            print(f"  · {n}")
        print()
    if problems:
        print(f"发现问题 {len(problems)} 项：")
        for p in problems:
            print(f"  ❌ {p}")
        print()
        print("静态审查未通过")
        return 1

    print("静态审查通过（未发现结构性缺陷）")
    print("提醒：静态审查无法替代真实执行，请在 Supabase 侧跑 rls_test.sql 确认。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
