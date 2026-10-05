# -*- coding: utf-8 -*-
"""敏感信息扫描器 —— 提交前检查，命中即阻断。

用途：
    ① 手动运行：python scan_secrets.py
    ② 作为 pre-commit 钩子：阶段 1 会写入 .husky/pre-commit 或 .git/hooks/pre-commit

设计原则：
    - 只报「真实值」，不报变量名、占位符与文档说明，避免误报导致钩子被绕过
    - 明确区分「禁止入库」与「允许出现的占位/说明」

退出码：
    0 = 未发现真实敏感信息，可提交
    1 = 发现真实敏感信息，禁止提交
"""
from __future__ import annotations

import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

# 跳过扫描的目录
SKIP_DIRS = {".git", "node_modules", "dist", ".next", "out", "build",
             ".turbo", ".venv", "venv", "__pycache__", "coverage"}

# 跳过扫描的二进制/文档扩展名
SKIP_EXT = {".docx", ".xlsx", ".pptx", ".pdf", ".jpg", ".jpeg", ".png",
            ".gif", ".webp", ".ico", ".wmf", ".emf", ".zip", ".woff", ".woff2"}

# 占位符特征：出现这些标记说明是模板而非真实值
PLACEHOLDER_MARKERS = (
    "<", ">", "your-", "xxx", "***", "…", "...",
    "example", "placeholder", "REPLACE", "填入", "待填", "自行",
)

# 真实敏感信息的判定规则
RULES: list[tuple[str, re.Pattern[str], str]] = [
    (
        "Supabase publishable/anon key",
        re.compile(r"\bsb_publishable_[A-Za-z0-9_\-]{16,}"),
        "anon key 本身可公开，但不应散落在文档中；统一放 .env.local",
    ),
    (
        "Supabase secret/service key",
        re.compile(r"\bsb_secret_[A-Za-z0-9_\-]{16,}"),
        "secret key 拥有绕过 RLS 的完全权限，绝不可入库",
    ),
    (
        "JWT 形式的密钥（疑似 anon 或 service_role）",
        re.compile(r"\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}"),
        "JWT key 绝不可入库",
    ),
    (
        "含真实密码的数据库连接串",
        re.compile(r"postgres(?:ql)?://[^:\s/]+:(?![<>{}\s]|PASSWORD|password|xxx|\*\*\*)[^@\s]{6,}@"),
        "数据库连接串含密码，绝不可入库",
    ),
    (
        "私钥文件内容",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"),
        "私钥绝不可入库",
    ),
    (
        "硬编码的 service_role 赋值",
        re.compile(r"SERVICE_ROLE_KEY\s*[:=]\s*['\"][A-Za-z0-9_\-\.]{20,}['\"]"),
        "service_role key 只能放 Edge Function Secrets",
    ),
]


def is_placeholder(line: str) -> bool:
    """判断该行是否为占位符/说明文字而非真实值。"""
    low = line.lower()
    return any(m.lower() in low for m in PLACEHOLDER_MARKERS)


def git_ignored(root: str) -> set[str]:
    """返回被 .gitignore 忽略的文件集合（这些文件本就不入库，无需扫描）。"""
    import subprocess
    try:
        out = subprocess.run(
            ["git", "status", "--ignored", "--porcelain"],
            cwd=root, capture_output=True, check=True,
        ).stdout.decode("utf-8", "replace")
    except (OSError, subprocess.CalledProcessError):
        return set()
    ignored: set[str] = set()
    for line in out.splitlines():
        if line.startswith("!! "):
            rel = line[3:].strip().strip('"')
            ignored.add(os.path.normpath(os.path.join(root, rel)))
    return ignored


def scan(root: str = ".") -> list[tuple[str, int, str, str]]:
    """返回 [(文件路径, 行号, 规则名, 说明)]。"""
    ignored = git_ignored(root)
    findings: list[tuple[str, int, str, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for filename in filenames:
            if os.path.splitext(filename)[1].lower() in SKIP_EXT:
                continue
            path = os.path.join(dirpath, filename)
            # 被 .gitignore 忽略的文件（如 .env.local）不会入库，跳过
            if os.path.normpath(path) in ignored:
                continue
            try:
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    lines = fh.readlines()
            except OSError:
                continue
            for lineno, line in enumerate(lines, 1):
                for name, pattern, advice in RULES:
                    if not pattern.search(line):
                        continue
                    if is_placeholder(line):
                        continue          # 占位符，放行
                    findings.append((path, lineno, name, advice))
                    break
    return findings


def main() -> int:
    findings = scan()
    if not findings:
        print("✅ 敏感信息扫描通过：未发现真实密钥。")
        return 0

    print("❌ 敏感信息扫描未通过，已阻断提交：\n")
    for path, lineno, name, advice in findings:
        print(f"  {path}:{lineno}")
        print(f"    类型：{name}")
        print(f"    处置：{advice}\n")
    print(f"共 {len(findings)} 处。请移除或移入 .env.local（该文件已被 .gitignore 忽略）。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
