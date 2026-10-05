# -*- coding: utf-8 -*-
"""
青阅循环 商业计划书 DOCX 排版优化脚本
=====================================
依赖安装：
    pip install python-docx pillow

用法：
    1) 按需修改 FOLDER_PATH / SRC_DOCX（源文件默认在 FOLDER_PATH 中自动查找）
    2) python optimize_bp.py

处理内容：
    * 自动在 FOLDER_PATH（含子目录）中查找 LOGO：png / jpg / jpeg / svg / emf
      常见文件名：logo、LOGO、青阅循环、项目logo、brand、青阅循环logo…
    * 全局把「书环智循环」替换为「青阅循环」
      （范围：正文、表格、页眉、页脚、目录、图表标题、附录、商标说明、一句话总结）
    * 重建封面：LOGO + 项目名 + 副标题 + 宣传语 + 版本 + 团队名称 + 日期
    * 页眉右侧插入 LOGO（高 0.85cm）；页脚保留宣传语「让闲置的书，再一次被需要」+ 页码
    * 三节结构：封面（无页眉页脚、无页码）/ 目录（罗马数字）/ 正文（页码从 1 开始）
    * 按章插入 22 个「图表占位」1×1 表格（浅灰边框、居中、约 6cm 高，图注在图框内底部，整体不跨页拆分）
    * 标题层级统一：第一章 / 1.1 / 1.1.1（黑体三号 / 四号 / 小四）
    * 正文宋体小四；表格五号、表头加粗居中、跨页重复标题行、浅色网格三线表
    * 页边距上下 2.54cm、左右 3.17cm；页眉页脚距边界 1.5cm
    * 写入 w:updateFields，Word 打开时自动更新目录与页码域
"""
from __future__ import annotations

import copy
import os
import re
import shutil
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# ----------------------------------------------------------------------------
# 配置区
# ----------------------------------------------------------------------------
FOLDER_PATH = r"F:\Working\Deepseek Harness_Working\Book_Reuse"
SRC_CANDIDATES = [
    "书环智循环_商业计划书_V3.0_修改版.docx",
    "书环智循环_商业计划书_V3.0_修改版.docx".replace("书环智循环", "青阅循环"),
]
SRC_DOCX = None            # 为 None 时自动按 SRC_CANDIDATES 查找
OUT_DOCX = os.path.join(FOLDER_PATH, "青阅循环_优化版.docx")

OLD_NAME = "书环智循环"
NEW_NAME = "青阅循环"
SLOGAN = "让闲置的书，再一次被需要"
SUBTITLE = "校园二手图书智能循环与生态服务平台"
TEAM_NAME = "【团队名称待填写】"
DOC_DATE = "【日期待填写】"
VERSION_LINE = "版本：V4.0_DSH优化"
COVER_TITLE = "创新创业项目商业计划书"

BODY_FONT = "宋体"
HEAD_FONT = "黑体"
BODY_SIZE = Pt(12)          # 小四
TABLE_SIZE = Pt(10.5)       # 五号
CAPTION_SIZE = Pt(9)        # 小五
H1_SIZE = Pt(16)            # 三号
H2_SIZE = Pt(14)            # 四号
H3_SIZE = Pt(12)            # 小四
GREY = "D0D0D0"
GREY_TEXT = "808080"
SUB_GREY = "595959"
ACCENT = "1F7A5C"
CONTENT_W = 15.24           # A4(21.59) - 3.17*2

LOGO_NAMES = ["logo", "青阅循环", "项目logo", "brand", "青阅循环logo", "校徽"]
LOGO_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".emf"]

# 需要移除的标题（不进入正文与目录）。留空表示全部保留。
# 说明：一级标题「项目一句话总结」保留与否由该列表控制，默认保留。
SKIP_HEADINGS: list[str] = []


def q(tag):
    return qn("w:" + tag)


# ----------------------------------------------------------------------------
# 通用 OOXML 工具
# ----------------------------------------------------------------------------
def set_run_font(run, name=BODY_FONT, size=None, bold=None, color=None):
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    latin = "Times New Roman" if name == BODY_FONT else name
    rFonts.set(qn("w:ascii"), latin)
    rFonts.set(qn("w:hAnsi"), latin)
    rFonts.set(qn("w:eastAsia"), name)
    rFonts.set(qn("w:cs"), latin)
    if size is not None:
        run.font.size = size
        szCs = rPr.find(qn("w:szCs"))
        if szCs is None:
            szCs = OxmlElement("w:szCs")
            rPr.append(szCs)
        szCs.set(qn("w:val"), str(int(size.pt * 2)))
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)


def style_paragraph(p, *, align=None, space_before=None, space_after=None,
                    line=None, first_indent=None, left_indent=None,
                    keep_with_next=None, keep_together=None):
    pf = p.paragraph_format
    if align is not None:
        p.alignment = align
    if space_before is not None:
        pf.space_before = space_before
    if space_after is not None:
        pf.space_after = space_after
    if line is not None:
        pf.line_spacing = line
    if first_indent is not None:
        pf.first_line_indent = first_indent
    if left_indent is not None:
        pf.left_indent = left_indent
    if keep_with_next is not None:
        pf.keep_with_next = keep_with_next
    if keep_together is not None:
        pf.keep_together = keep_together


def set_table_borders(table, color=GREY, outer=6, inner=4, inside=True):
    tblPr = table._tbl.tblPr
    old = tblPr.find(qn("w:tblBorders"))
    if old is not None:
        tblPr.remove(old)
    borders = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right"):
        el = OxmlElement("w:" + side)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(outer if side in ("top", "bottom") else max(inner, 4)))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    for side in ("insideH", "insideV"):
        el = OxmlElement("w:" + side)
        el.set(qn("w:val"), "single" if inside else "none")
        el.set(qn("w:sz"), str(inner))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    tblPr.append(borders)


def set_cell_borders(cell, color=GREY, sz=6, sides=("top", "left", "bottom", "right")):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = tcPr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tcPr.append(borders)
    for side in sides:
        el = OxmlElement("w:" + side)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(sz))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)


def set_repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    if trPr.find(qn("w:tblHeader")) is None:
        el = OxmlElement("w:tblHeader")
        el.set(qn("w:val"), "true")
        trPr.append(el)


def set_row_cant_split(row):
    trPr = row._tr.get_or_add_trPr()
    if trPr.find(qn("w:cantSplit")) is None:
        trPr.append(OxmlElement("w:cantSplit"))


def set_cell_vcenter(cell):
    tcPr = cell._tc.get_or_add_tcPr()
    if tcPr.find(qn("w:vAlign")) is None:
        el = OxmlElement("w:vAlign")
        el.set(qn("w:val"), "center")
        tcPr.append(el)


def set_row_height(row, cm, rule="atLeast"):
    trPr = row._tr.get_or_add_trPr()
    old = trPr.find(qn("w:trHeight"))
    if old is not None:
        trPr.remove(old)
    el = OxmlElement("w:trHeight")
    el.set(qn("w:val"), str(int(cm * 567)))
    el.set(qn("w:hRule"), rule)
    trPr.append(el)


def set_table_layout_fixed(table):
    tblPr = table._tbl.tblPr
    old = tblPr.find(qn("w:tblLayout"))
    if old is not None:
        tblPr.remove(old)
    el = OxmlElement("w:tblLayout")
    el.set(qn("w:type"), "fixed")
    tblPr.append(el)


def set_page_number(section, fmt="decimal", start=None):
    sectPr = section._sectPr
    old = sectPr.find(qn("w:pgNumType"))
    if old is not None:
        sectPr.remove(old)
    el = OxmlElement("w:pgNumType")
    if fmt:
        el.set(qn("w:fmt"), fmt)
    if start is not None:
        el.set(qn("w:start"), str(start))
    sectPr.append(el)


def add_page_field(paragraph, size=CAPTION_SIZE, color=SUB_GREY):
    run = paragraph.add_run()
    r = run._element
    b = OxmlElement("w:fldChar"); b.set(qn("w:fldCharType"), "begin")
    i = OxmlElement("w:instrText"); i.set(qn("xml:space"), "preserve"); i.text = " PAGE "
    s = OxmlElement("w:fldChar"); s.set(qn("w:fldCharType"), "separate")
    t = OxmlElement("w:t"); t.text = "1"
    e = OxmlElement("w:fldChar"); e.set(qn("w:fldCharType"), "end")
    for el in (b, i, s, t, e):
        r.append(el)
    set_run_font(run, BODY_FONT, size, False, color)
    return run


def add_bookmark(paragraph, name, bid):
    start = OxmlElement("w:bookmarkStart")
    start.set(qn("w:id"), str(bid))
    start.set(qn("w:name"), name)
    end = OxmlElement("w:bookmarkEnd")
    end.set(qn("w:id"), str(bid))
    p = paragraph._p
    pPr = p.find(qn("w:pPr"))
    if pPr is not None:
        pPr.addnext(end)
        pPr.addnext(start)
    else:
        p.insert(0, end)
        p.insert(0, start)


def new_paragraph_element():
    return OxmlElement("w:p")


# ----------------------------------------------------------------------------
# LOGO 查找
# ----------------------------------------------------------------------------
def find_logo(folder):
    if not os.path.isdir(folder):
        print(f"[警告] 文件夹不存在：{folder}")
        return None
    candidates = []
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs
                   if not d.startswith(".") and d not in ("~$", "__pycache__", "preview")]
        for fn in files:
            stem, ext = os.path.splitext(fn)
            ext = ext.lower()
            if ext not in LOGO_EXTS:
                continue
            low = stem.lower()
            matched = any(key.lower() in low for key in LOGO_NAMES)
            if not matched:
                continue                       # 只接受命中常见命名的文件
            # 分层：文件名直接含 logo / 青阅循环 的为第一层
            exact = 1 if low in [k.lower() for k in LOGO_NAMES] else 0
            tier = 1 if ("logo" in low or "青阅循环" in low) else 0
            full = os.path.join(root, fn)
            try:
                size = os.path.getsize(full)
            except OSError:
                size = 1 << 40
            if size < 1024:            # 过小文件通常是缩略图，降级
                tier -= 1
            candidates.append((tier, size, 0 if ext == ".png" else 1, exact, full))
    if not candidates:
        return None
    # 排序优先级：命名分层 > 文件体积（小者优先）> png 优先 > 精确命名 > 路径稳定
    candidates.sort(key=lambda x: (-x[0], x[1], x[2], -x[3], len(x[4]), x[4]))
    best = candidates[0][4]
    print(f"[信息] 找到 LOGO：{best}（{os.path.getsize(best) / 1024:.0f} KB）")
    for tier, sz, _, _, p in candidates[1:]:
        print(f"        其他候选：{p}（{sz / 1024:.0f} KB）")
    for tier, sz, _, _, p in candidates:
        if os.path.splitext(p)[1].lower() in (".svg", ".emf"):
            print(f"[提示] {os.path.basename(p)} 为矢量格式，Word/python-docx 支持有限，"
                  f"建议同时提供同名 png 版本。")
    return best

# ----------------------------------------------------------------------------
# 文本替换
# ----------------------------------------------------------------------------
def replace_in_paragraph(p, old, new):
    runs = p.runs
    if not runs:
        return 0
    count = 0
    while True:
        text = "".join(r.text for r in runs)
        idx = text.find(old)
        if idx < 0:
            break
        pos = 0
        start_i = end_i = None
        start_off = end_off = 0
        for i, r in enumerate(runs):
            ln = len(r.text)
            if start_i is None and pos + ln > idx:
                start_i, start_off = i, idx - pos
            if start_i is not None and pos + ln >= idx + len(old):
                end_i, end_off = i, idx + len(old) - pos
                break
            pos += ln
        if start_i is None or end_i is None:
            break
        first, last = runs[start_i], runs[end_i]
        if start_i == end_i:
            first.text = first.text[:start_off] + new + first.text[end_off:]
        else:
            first.text = first.text[:start_off] + new
            for i in range(start_i + 1, end_i):
                runs[i].text = ""
            last.text = last.text[end_off:]
        count += 1
    return count


def iter_all_paragraphs(doc):
    out = []

    def walk(container):
        for p in container.paragraphs:
            out.append(p)
        for t in container.tables:
            for row in t.rows:
                for cell in row.cells:
                    walk(cell)

    walk(doc)
    for s in doc.sections:
        for part in (s.header, s.footer, s.first_page_header,
                     s.first_page_footer, s.even_page_header, s.even_page_footer):
            try:
                walk(part)
            except Exception:
                pass
    return out


def global_replace(doc, old, new):
    return sum(replace_in_paragraph(p, old, new) for p in iter_all_paragraphs(doc))


# ----------------------------------------------------------------------------
# 图表占位清单（22 个）
# ----------------------------------------------------------------------------
S_TBD = "待补充"
S_VERIFY = "待调研验证（问卷调研/试点运营数据）"
S_STAT = "待调研验证（教育部教育统计公报 + 团队测算）"
S_FIN = "待补充（团队财务模型，须以试点实测数据校准）"

FIGURES = [
    # ---------- 第一章 执行摘要 ----------
    dict(no="1-1", ch=1, title="项目商业模式总览图", ctype="架构图",
         src="待补充（团队商业逻辑梳理）",
         desc="回收端（预约上门 / 校园回收点 / 智能柜）→ 标准化质检分级 → 线上平台与校园仓储 → "
              "出售 / 交换 / 租赁 / 公益捐赠多路径循环 → 数据沉淀反哺需求预测与动态定价，"
              "并标注各方（学生、平台、学校、合作企业）的价值交换关系。",
         anchor=("text", "项目重点解决毕业季旧书处理麻烦", False)),

    # ---------- 第二章 项目背景与市场分析 ----------
    dict(no="2-1", ch=2, title="市场规模三级测算图", ctype="柱状图", src=S_STAT,
         desc="按 TAM（全国市场）→ SAM（目标区域市场）→ SOM（可获得市场）三级口径呈现规模量级，"
              "正式版须注明各层级测算公式、参数来源与假设条件。",
         anchor=("text", "增长逻辑：覆盖高校数量扩张", False)),
    dict(no="2-2", ch=2, title="用户痛点对比图", ctype="柱状图", src=S_VERIFY,
         desc="对比毕业生/闲置卖方与低年级教材买方在“处理麻烦、售价过低、信息分散、找书难、搬运成本高”"
              "等痛点上的占比差异。",
         anchor=("text", "分用户群体痛点与解决方案：", True)),
    dict(no="2-3", ch=2, title="竞争格局矩阵", ctype="矩阵图",
         src="待调研验证（竞品公开资料 + 团队调研）",
         desc="横轴为“校园垂直程度”，纵轴为“线下交付与质检能力”，"
              "标注综合二手平台、二手图书电商、校内自发交易群与本项目的位置。",
         anchor=("text", "分用户群体痛点与解决方案：", False)),
    dict(no="2-4", ch=2, title="SWOT 分析图", ctype="矩阵图",
         src="待补充（基于本计划书分析整理）",
         desc="四象限呈现优势（S）、劣势（W）、机会（O）、威胁（T），正式版须补充每条要素的支撑证据与应对策略。",
         anchor=("text", "2.6 SWOT分析", False)),

    # ---------- 第三章 产品与技术 ----------
    dict(no="3-1", ch=3, title="产品功能架构图", ctype="架构图",
         src="待补充（团队产品设计文档）",
         desc="用户层：微信小程序（C 端：买书 / 卖书 / 换书 / 租赁 / 碳账户）＋ 校园智能回收柜交互屏；"
              "服务层：API 网关、用户与订单服务、ISBN 与图书库、估价与定价引擎、匹配推荐、碳账户；"
              "数据层：图书元数据库、供需数据库、图像样本库、运营指标库；设备层：智能回收柜、摄像头、IoT 控制板。",
         anchor=("text", "3.1.1 微信小程序", False)),
    dict(no="3-2", ch=3, title="智能回收柜交互流程图", ctype="流程图",
         src="待补充（团队硬件方案设计）",
         desc="用户小程序下单 → 获得取件码 → 柜端扫码/输码 → 系统分配格口并弹门 → 用户放入图书 → "
              "摄像头采集图像上传云端 → 估价模型初步定价 → 用户小程序确认 → 柜门关闭锁定 → 状态回传运营后台。",
         anchor=("text", "评审关注点回应：训练图像均来自团队自采", False)),
    dict(no="3-3", ch=3, title="技术路线图", ctype="流程图",
         src="待补充（团队技术开发计划）",
         desc="MVP 原型（规则化品相评价 + ISBN 识别）→ 视觉识别模型（YOLOv8 缺陷检测、数据集扩充与指标验证）→ "
              "动态定价引擎（供需系数、时效系数联动）→ 硬件端云协同（4G/Wi-Fi 双链路、MQTT/HTTPS）→ 需求预测与智能匹配。",
         anchor=("text", "3.4 产品创新点与技术壁垒", True)),

    # ---------- 第四章 商业模式 ----------
    dict(no="4-1", ch=4, title="商业模式画布", ctype="矩阵图",
         src="待补充（基于本计划书商业模式整理）",
         desc="九宫格呈现客户细分、价值主张、渠道通路、客户关系、收入来源、核心资源、关键业务、重要合作与成本结构。",
         anchor=("heading", "4.1 价值主张", False)),
    dict(no="4-2", ch=4, title="盈利模式结构图", ctype="饼图", src=S_FIN,
         desc="呈现买卖差价、教材与考研资料租赁、校园广告与品牌赞助、ESG 数据服务与企业合作四类收入的"
              "构成比例（目标情景，需以试点实测校准）。",
         anchor=("heading", "4.2 盈利模式", False)),

    # ---------- 第五章 运营与营销策略 ----------
    dict(no="5-1", ch=5, title="运营时间轴", ctype="流程图",
         src="待补充（团队运营计划）",
         desc="按 MVP 验证（0-3 个月）→ 单校试点（4-9 个月）→ 多校复制（10-24 个月）→ 区域扩张（25-36 个月）"
              "呈现关键里程碑、阶段目标与验收指标。",
         anchor=("heading", "第五章 运营与营销策略", False)),
    dict(no="5-2", ch=5, title="用户增长漏斗图", ctype="柱状图", src=S_VERIFY,
         desc="曝光（校园活动/社群）→ 扫码关注 → 注册（CAC≤8 元目标）→ 首单（卖书或买书）→ "
              "复购（次月留存≥45% 目标）→ 推荐裂变，标注各层转化率目标值。",
         anchor=("text", "裂变传播路径设计：", True)),

    # ---------- 第六章 供应链与物流体系 ----------
    dict(no="6-1", ch=6, title="校园仓储布局示意图", ctype="示意图",
         src="待补充（校园实地勘察）",
         desc="标注集中仓储中心、宿舍区回收点、图书馆回收点、教学区回收点与智能柜部署位置的相对关系、"
              "服务半径与覆盖学生人数。",
         anchor=("heading", "6.1 校园仓储与智能柜终端布局", False)),
    dict(no="6-2", ch=6, title="供应链与逆向物流流程图", ctype="流程图",
         src="待补充（团队供应链方案）",
         desc="回收投递（预约上门/回收点/智能柜）→ 集中揽收 → 质检分级与合规消毒 → 入库上架 → "
              "校内匹配与交付 → 跨校调拨 / 公益捐赠分流 → 滞销预警与再流通，形成闭环逆向物流。",
         anchor=("heading", "6.3 校园逆向物流与末端配送", True)),

    # ---------- 第七章 团队介绍 ----------
    dict(no="7-1", ch=7, title="组织架构图", ctype="架构图",
         src="待补充（团队实际分工）",
         desc="项目负责人统筹，下设产品技术组、运营市场组、供应链组、财务与合规组，"
              "并标注校园大使/勤工助学团队与指导老师、顾问的支撑关系。",
         anchor=("heading", "7.2 组织架构与部门职责", False)),

    # ---------- 第八章 财务规划 ----------
    dict(no="8-1", ch=8, title="未来 3 年收入预测柱状图", ctype="柱状图", src=S_FIN,
         desc="按 Y1/Y2/Y3 目标情景（覆盖高校 2 所 → 10 所 → 35 所）呈现营业收入规模，"
              "并同时给出保守 / 基准 / 乐观三情景区间。",
         anchor=("text", "正式参赛时须附：收入构成明细", False)),
    dict(no="8-2", ch=8, title="成本结构饼图", ctype="饼图", src=S_FIN,
         desc="呈现图书采购（变动成本）、包装运输、平台支付手续费、用户激励、固定成本与折旧摊销的构成比例。",
         anchor=("heading", "8.3 成本与费用预测", False)),
    dict(no="8-3", ch=8, title="现金流折线图", ctype="折线图", src=S_FIN,
         desc="按季度呈现净现金流与期末现金余额走势，标注第 6 季度季度净现金流转正的关键拐点"
              "与 30 万元首轮资金的支撑周期。",
         anchor=("text", "要点：目标情景下首轮30万元资金", False)),
    dict(no="8-4", ch=8, title="盈亏平衡分析图", ctype="折线图", src=S_FIN,
         desc="以月成交册数为横轴，呈现营业收入线、总成本线与固定成本线，"
              "标注单校月盈亏平衡点约 1,858 册（日均约 62 册）。",
         anchor=("heading", "8.5 盈亏平衡点与ROI", False)),

    # ---------- 第九章 风险分析与应对措施 ----------
    dict(no="9-1", ch=9, title="风险矩阵图", ctype="矩阵图",
         src="待补充（团队风险评估）",
         desc="以“发生可能性”为横轴、“影响程度”为纵轴，标注技术硬件、市场竞争、政策合规、版权、"
              "运营与财务等风险的位置及应对优先级。",
         anchor=("text", "结论：模型对", False)),

    # ---------- 第十章 社会价值与育人成果 ----------
    dict(no="10-1", ch=10, title="碳减排测算逻辑图", ctype="流程图",
         src="待验证（ISO 14040/14044 方法学，须委托或参照有明确依据的 LCA 研究）",
         desc="单册减排量 =（原生造纸与印刷碳排放 + 新书流通配送碳排放）−（二手回收消毒碳排放 + 二手履约配送碳排放）；"
              "示例参数下每循环 1 册约减排 0.85 kg CO₂e（原稿“1.2kg”口径须重新核验后方可使用）。",
         anchor=("text", "按一本300g胶版纸教材测算", False)),
    dict(no="10-2", ch=10, title="社会价值与育人成果图", ctype="架构图",
         src="待补充（三年目标值，非既成事实）",
         desc="呈现环保价值（图书循环册数、碳减排量）、社会价值（公益捐赠、无废校园）与育人成果"
              "（勤工俭学岗位 20 个以上、带动创业孵化 10 名以上、实践课程与竞赛成果）三条主线。",
         anchor=("heading", "10.2 产教融合", False)),
]

PLACEHOLDER_TPL = "【图表占位｜图 {no}：{title}｜建议图表类型：{ctype}｜数据来源：{src}】"

# 项目一句话总结（按任务要求逐字替换；引号统一为文档既有风格）
NEW_SUMMARY = (
    "\"青阅循环\"以校园二手教材和图书为切入口，通过\"数字平台+线下回收+标准化质检+智能匹配+循环交易\""
    "的模式，让闲置图书在校园内部高效流转，在降低学生购书和处理成本的同时，探索具有商业可持续性、"
    "环保价值和育人价值的校园循环经济服务模式。"
)
SUMMARY_OLD_PREFIX = ("“青阅循环”以校园二手教材和图书为切入口",
                      "\"青阅循环\"以校园二手教材和图书为切入口")
SUMMARY_CAUTION = (
    "注：本段为项目定位总结；其中毛利率、回本周期、净利润等均为示例数据与目标情景值，"
    "须以团队试点实测数据替换后方可对外使用。"
)


# ----------------------------------------------------------------------------
# 占位块构造
# ----------------------------------------------------------------------------
def fill_placeholder_cell(cell, fig):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_paragraph(p, space_before=Pt(6), space_after=Pt(6), line=1.25, first_indent=Cm(0))
    r = p.add_run(PLACEHOLDER_TPL.format(no=fig["no"], title=fig["title"],
                                         ctype=fig["ctype"], src=fig["src"]))
    set_run_font(r, BODY_FONT, TABLE_SIZE, True, GREY_TEXT)

    p2 = cell.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_paragraph(p2, space_before=Pt(6), space_after=Pt(6), line=1.25, first_indent=Cm(0))
    r2 = p2.add_run(fig["desc"])
    set_run_font(r2, BODY_FONT, TABLE_SIZE, False, GREY_TEXT)

    p3 = cell.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_paragraph(p3, space_before=Pt(6), space_after=Pt(6), line=1.25, first_indent=Cm(0))
    r3 = p3.add_run("（此处插入图片/图表，替换本占位框并删除占位文字）")
    set_run_font(r3, BODY_FONT, CAPTION_SIZE, False, "A6A6A6")

    # 图注置于同一单元格底部，保证图注与图框同页、不被分页拆散
    p4 = cell.add_paragraph()
    p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_paragraph(p4, space_before=Pt(8), space_after=Pt(4), line=1.0, first_indent=Cm(0))
    r4 = p4.add_run(f"图 {fig['no']} {fig['title']}（待补充数据）")
    set_run_font(r4, BODY_FONT, CAPTION_SIZE, True, SUB_GREY)

    set_cell_vcenter(cell)
    set_cell_borders(cell, GREY, 6)


def make_figure_block(doc, fig):
    """返回一个独立的 1×1 图表占位表格元素（含图注），整体不可跨页拆分。"""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_layout_fixed(table)
    set_table_borders(table, GREY, outer=6, inner=4, inside=False)
    set_row_height(table.rows[0], 6.0, "atLeast")
    set_row_cant_split(table.rows[0])
    table.columns[0].width = Cm(CONTENT_W)
    table.rows[0].cells[0].width = Cm(CONTENT_W)
    fill_placeholder_cell(table.rows[0].cells[0], fig)

    tbl_el = table._tbl
    tbl_el.getparent().remove(tbl_el)
    return tbl_el, None


def insert_figure_block(doc, ref_el, fig, before=False):
    tbl_el, _ = make_figure_block(doc, fig)
    if before:
        ref_el.addprevious(tbl_el)
    else:
        ref_el.addnext(tbl_el)
    return tbl_el


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
def resolve_src():
    if SRC_DOCX and os.path.isfile(SRC_DOCX):
        return SRC_DOCX
    for name in SRC_CANDIDATES:
        p = os.path.join(FOLDER_PATH, name)
        if os.path.isfile(p):
            return p
    for fn in os.listdir(FOLDER_PATH):
        if fn.lower().endswith(".docx") and "商业计划书" in fn and not fn.startswith("~$"):
            return os.path.join(FOLDER_PATH, fn)
    return None


def main():
    src = resolve_src()
    if not src:
        print("[错误] 未找到源 DOCX，请设置 SRC_DOCX 或检查 FOLDER_PATH。")
        sys.exit(1)
    print(f"[信息] 源文件：{src}")

    logo = find_logo(FOLDER_PATH)
    if not logo:
        print("未找到 LOGO，请检查文件名或路径")
        print("推荐命名：青阅循环_logo.png（或 logo.png / 项目logo.png，置于项目文件夹根目录）")
    elif os.path.splitext(logo)[1].lower() in (".svg", ".emf"):
        print("[警告] 仅找到矢量 LOGO，Word 兼容性有限，本次跳过插入。")
        logo = None

    shutil.copy2(src, OUT_DOCX + ".bak")
    doc = Document(src)
    print(f"[信息] 源文档：段落 {len(doc.paragraphs)}，表格 {len(doc.tables)}，节 {len(doc.sections)}")

    body = doc.element.body
    from docx.table import Table  # noqa: F401
    from docx.text.paragraph import Paragraph  # noqa: F401

    # ---------------------------------------------------------------- 1 替换
    n1 = global_replace(doc, OLD_NAME, NEW_NAME)
    print(f"[信息] 全局替换「{OLD_NAME}」→「{NEW_NAME}」：{n1} 处")

    # -------------------------------------------------- 2 删除旧图形占位表
    old_ph = []
    for t in doc.tables:
        if len(t.rows) == 1 and len(t.columns) == 1:
            txt = t.rows[0].cells[0].text.strip()
            if txt.startswith("【"):
                old_ph.append((t._tbl, txt))
    for tbl, txt in old_ph:
        tbl.getparent().remove(tbl)
    print(f"[信息] 移除旧图形占位表 {len(old_ph)} 个，将统一重建为图表占位格式")

    # ---------------------------------------------------------------- 3 封面
    # 先删除原封面区段落，再重建；重建后记录元素 id，供后续正文样式统一时跳过
    for p in list(doc.paragraphs[:11]):
        p._p.getparent().remove(p._p)
    first_body_el = body[0]

    def mkcover(text="", font=BODY_FONT, size=Pt(12), bold=False, color=None,
                sa=0, sb=0, line=1.5):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        style_paragraph(p, space_before=Pt(sb), space_after=Pt(sa), line=line,
                        first_indent=Cm(0))
        if text:
            set_run_font(p.add_run(text), font, size, bold, color)
        return p

    cover_parts = [mkcover("", sa=0, line=1.0)]
    if logo:
        lp = mkcover("", sa=4, line=1.0)
        try:
            lp.add_run().add_picture(logo, width=Cm(3.6))
        except Exception as exc:
            print(f"[警告] 封面 LOGO 插入失败：{exc}")
        cover_parts.append(lp)
    cover_parts += [
        mkcover("", sa=12, line=1.0),
        mkcover(COVER_TITLE, size=Pt(14), sa=18),
        mkcover(NEW_NAME, font=HEAD_FONT, size=Pt(36), bold=True, color=ACCENT, sa=10, line=1.4),
        mkcover(SUBTITLE, size=Pt(16), sa=8, line=1.4),
        mkcover(SLOGAN, size=Pt(12), color=SUB_GREY, sa=8),
        mkcover("", sa=6, line=1.0),
        mkcover(VERSION_LINE, size=Pt(11), sa=6),
        mkcover(f"团队名称：{TEAM_NAME}", size=Pt(11), sa=6),
        mkcover(DOC_DATE, size=Pt(11), sa=0),
    ]
    cover_elements = set()
    for p in cover_parts:
        el = p._p
        el.getparent().remove(el)
        first_body_el.addprevious(el)
        cover_elements.add(id(el))
    print(f"[信息] 重建封面：LOGO {'已插入（宽 3.6cm，顶部居中）' if logo else '未插入'}"
          f"，项目名 {Pt(36).pt:.0f}pt / 副标题 {Pt(16).pt:.0f}pt / 宣传语 {Pt(12).pt:.0f}pt")

    # ------------------------------------- 3.5 按配置移除指定标题（含目录条目）
    if SKIP_HEADINGS:
        for p in list(doc.paragraphs):
            if p.style.name.startswith("Heading") and p.text.strip() in SKIP_HEADINGS:
                p._p.getparent().remove(p._p)
                print(f"[信息] 按配置移除标题：{p.text.strip()}")

    # ------------------------------------------- 4 标题层级 & 正文样式统一
    # 封面段落必须跳过，否则会被正文样式（宋体小四/黑色）覆盖
    for p in doc.paragraphs:
        if id(p._p) in cover_elements:
            continue
        st = p.style.name
        txt = p.text.strip()
        if st == "Heading 1":
            style_paragraph(p, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=Pt(18),
                            space_after=Pt(10), line=1.5, first_indent=Cm(0),
                            keep_with_next=True, keep_together=True)
            for r in p.runs:
                set_run_font(r, HEAD_FONT, H1_SIZE, True, "000000")
        elif st == "Heading 2":
            style_paragraph(p, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=Pt(14),
                            space_after=Pt(8), line=1.5, first_indent=Cm(0),
                            keep_with_next=True, keep_together=True)
            for r in p.runs:
                set_run_font(r, HEAD_FONT, H2_SIZE, True, "000000")
        elif st == "Heading 3":
            style_paragraph(p, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=Pt(10),
                            space_after=Pt(6), line=1.5, first_indent=Cm(0),
                            keep_with_next=True, keep_together=True)
            for r in p.runs:
                set_run_font(r, HEAD_FONT, H3_SIZE, True, "000000")
        elif txt and not txt.startswith("【"):
            style_paragraph(p, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=Pt(0),
                            space_after=Pt(6), line=1.5, first_indent=Cm(0.85))
            for r in p.runs:
                set_run_font(r, BODY_FONT, BODY_SIZE, None, "000000")

    # 3.1.1 / 3.1.2 由 Heading 2 纠正为 Heading 3
    for p in doc.paragraphs:
        if p.style.name == "Heading 2" and re.match(r"^3\.1\.[12]\s", p.text.strip()):
            p.style = doc.styles["Heading 3"]
            style_paragraph(p, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=Pt(10),
                            space_after=Pt(6), line=1.5, first_indent=Cm(0),
                            keep_with_next=True, keep_together=True)
            for r in p.runs:
                set_run_font(r, HEAD_FONT, H3_SIZE, True, "000000")
            print(f"[信息] 标题层级纠正：{p.text.strip()} → Heading 3（原为 Heading 2）")

    # ------------------------------------------------------ 5 插入图表占位
    def find_anchor(text, exact=False):
        for p in doc.paragraphs:
            t = p.text.strip()
            if (t == text) if exact else t.startswith(text):
                return p
        return None

    inserted = []
    for fig in FIGURES:
        kind, ref, before = fig["anchor"]
        anchor_p = find_anchor(ref, exact=(kind == "heading"))
        if anchor_p is None:
            print(f"[警告] 未找到图 {fig['no']} 的插入锚点：{ref!r}")
            continue
        insert_figure_block(doc, anchor_p._p, fig, before=before)
        inserted.append(fig)
        print(f"[信息] 插入 图 {fig['no']}  {fig['title']}  [{fig['ctype']}]"
              f"  ← {'前' if before else '后'}置于「{ref}」")

    # ------------------------------------------------- 6 三节结构 + 页码
    cover_last = next((p for p in doc.paragraphs if p.text.strip() == DOC_DATE), None)
    sdt = next((ch for ch in body.iterchildren() if ch.tag == q("sdt")), None)
    if sdt is None:
        print("[警告] 未找到目录内容控件，跳过目录重建与目录分节")
    base_sectPr = body.find(q("sectPr"))

    def make_sect_para(sectPr):
        p = new_paragraph_element()
        pPr = OxmlElement("w:pPr")
        pPr.append(sectPr)
        p.append(pPr)
        return p

    n_break = 0
    if cover_last is not None and base_sectPr is not None:
        cover_last._p.addnext(make_sect_para(copy.deepcopy(base_sectPr)))
        n_break += 1
    if sdt is not None and base_sectPr is not None:
        sdt.addnext(make_sect_para(copy.deepcopy(base_sectPr)))
        n_break += 1
    print(f"[信息] 插入分节符 {n_break} 个（目标 2 个：封面后 + 目录后）")

    sections = doc.sections
    print(f"[信息] 文档节数：{len(sections)}")

    for i, s in enumerate(sections):
        s.top_margin = Cm(2.54)
        s.bottom_margin = Cm(2.54)
        s.left_margin = Cm(3.17)
        s.right_margin = Cm(3.17)
        s.header_distance = Cm(1.5)
        s.footer_distance = Cm(1.5)
        s.different_first_page_header_footer = False
        if i == 0:
            set_page_number(s, "decimal", 1)
        elif i == 1:
            set_page_number(s, "upperRoman", 1)
        else:
            set_page_number(s, "decimal", 1)

    def clear_part(part):
        for el in list(part._element):
            if el.tag in (q("p"), q("tbl")):
                part._element.remove(el)

    def setup_hf(section):
        header = section.header
        header.is_linked_to_previous = False
        clear_part(header)
        footer = section.footer
        footer.is_linked_to_previous = False
        clear_part(footer)

        # ---- 页眉：左项目名 / 右 LOGO ----
        htbl = header.add_table(rows=1, cols=2, width=Cm(CONTENT_W))
        htbl.autofit = False
        set_table_layout_fixed(htbl)
        htbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        c0, c1 = htbl.rows[0].cells
        c0.width = Cm(10.0)
        c1.width = Cm(CONTENT_W - 10.0)
        p0 = c0.paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        style_paragraph(p0, space_after=Pt(0), line=1.0, first_indent=Cm(0))
        set_run_font(p0.add_run(f"{NEW_NAME} · {SUBTITLE}"), BODY_FONT, Pt(9), False, SUB_GREY)
        p1 = c1.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        style_paragraph(p1, space_after=Pt(0), line=1.0, first_indent=Cm(0))
        if logo:
            try:
                p1.add_run().add_picture(logo, height=Cm(0.85))
            except Exception as exc:
                print(f"[警告] 页眉 LOGO 插入失败：{exc}")
        else:
            set_run_font(p1.add_run(f"[LOGO] {NEW_NAME}"), BODY_FONT, Pt(9), True, GREY_TEXT)
        set_table_borders(htbl, "FFFFFF", outer=2, inner=2, inside=False)
        for c in (c0, c1):
            set_cell_borders(c, "FFFFFF", 2)
        set_cell_vcenter(c0)
        set_cell_vcenter(c1)
        # 页眉下框线
        hp = header.add_paragraph()
        style_paragraph(hp, space_before=Pt(0), space_after=Pt(0), line=1.0)
        pPr = hp._p.get_or_add_pPr()
        pbdr = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "6")
        bottom.set(qn("w:space"), "1")
        bottom.set(qn("w:color"), GREY)
        pbdr.append(bottom)
        pPr.append(pbdr)

        # ---- 页脚：宣传语 + 页码 ----
        fp = footer.add_paragraph()
        style_paragraph(fp, space_before=Pt(2), space_after=Pt(0), line=1.0,
                        first_indent=Cm(0))
        fp.alignment = WD_ALIGN_PARAGRAPH.LEFT
        set_run_font(fp.add_run(SLOGAN), BODY_FONT, Pt(9), False, SUB_GREY)
        # 制表位右对齐到内容宽度
        pPr = fp._p.get_or_add_pPr()
        tabs = OxmlElement("w:tabs")
        tab = OxmlElement("w:tab")
        tab.set(qn("w:val"), "right")
        tab.set(qn("w:leader"), "none")
        tab.set(qn("w:pos"), str(int(CONTENT_W * 567)))
        tabs.append(tab)
        pPr.append(tabs)
        fp.add_run().add_tab()
        add_page_field(fp, Pt(9), SUB_GREY)

    for i, s in enumerate(sections):
        setup_hf(s)

    # 修正页眉页脚归属：
    #   封面（section0）/ 目录（section1）不显示页眉页脚与页码；
    #   正文（section2）显示内容页眉页脚（section2 独占已填充的页眉页脚部件）。
    for si in (0, 1):
        sec = sections[si]
        sec.header.is_linked_to_previous = False
        sec.footer.is_linked_to_previous = False
        for ref_type in ("headerReference", "footerReference"):
            for el in sec._sectPr.findall(qn("w:" + ref_type)):
                sec._sectPr.remove(el)
    print("[信息] 页眉页脚归属修正：封面与目录不显示页眉页脚/页码，正文显示")
    print(f"[信息] 页眉页脚已配置（LOGO 页眉高度 0.85cm）")

    # ------------------------------------------------------ 7 表格统一格式
    def in_header(t):
        el = t._tbl.getparent()
        while el is not None:
            if el.tag in (q("hdr"), q("ftr")):
                return True
            el = el.getparent()
        return False

    n_tbl = 0
    for t in doc.tables:
        if in_header(t):
            continue
        ncols = len(t.columns)
        if ncols == 0:
            continue
        n_tbl += 1
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False
        set_table_layout_fixed(t)
        is_placeholder = (ncols == 1 and t.rows[0].cells[0].text.strip().startswith("【图表占位"))
        if is_placeholder:
            set_table_borders(t, GREY, outer=6, inner=4, inside=False)
            set_cell_borders(t.rows[0].cells[0], GREY, 6)
            t.columns[0].width = Cm(CONTENT_W)
            t.rows[0].cells[0].width = Cm(CONTENT_W)
            set_row_height(t.rows[0], 6.0, "atLeast")
            set_row_cant_split(t.rows[0])
            continue
        set_table_borders(t, GREY, outer=6, inner=4, inside=True)
        w = CONTENT_W / ncols
        for col in t.columns:
            col.width = Cm(w)
        for ri, row in enumerate(t.rows):
            set_row_cant_split(row)
            for cell in row.cells:
                cell.width = Cm(w)
                set_cell_vcenter(cell)
                for p in cell.paragraphs:
                    p.alignment = (WD_ALIGN_PARAGRAPH.CENTER if ri == 0
                                   else WD_ALIGN_PARAGRAPH.LEFT)
                    style_paragraph(p, space_before=Pt(2), space_after=Pt(2),
                                    line=1.15, first_indent=Cm(0))
                    for r in p.runs:
                        set_run_font(r, BODY_FONT, TABLE_SIZE, (ri == 0), "000000")
        set_repeat_header(t.rows[0])
        set_row_height(t.rows[0], 0.8, "atLeast")
    print(f"[信息] 表格格式化：{n_tbl} 个（三线表/浅色网格 + 表头加粗居中 + 跨页重复表头）")

    # ------------------------------------------- 7.5 项目一句话总结替换
    for p in doc.paragraphs:
        t = p.text.strip()
        if t.startswith(SUMMARY_OLD_PREFIX):
            runs = p.runs
            if runs:
                runs[0].text = NEW_SUMMARY
                for r in runs[1:]:
                    r.text = ""
                # 追加数据待验证提示段（保持谨慎表述）
                np_el = p._p.makeelement(q("p"), {})
                p._p.addnext(np_el)
                from docx.text.paragraph import Paragraph as _P
                np = _P(np_el, p._parent)
                np.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                style_paragraph(np, space_before=Pt(0), space_after=Pt(6), line=1.5,
                                first_indent=Cm(0.85))
                set_run_font(np.add_run(SUMMARY_CAUTION), BODY_FONT, Pt(10.5),
                             False, SUB_GREY)
                print("[信息] 已替换「项目一句话总结」并追加数据待验证提示")
            break

    # --------------------------------------------------------- 8 重建目录
    if sdt is not None:
        n = rebuild_toc(doc, sdt)
        print(f"[信息] 重建目录：{n} 条（Word 打开时自动刷新页码）")

    # ------------------------------------------------- 9 settings 与属性
    settings = doc.settings.element
    old = settings.find(q("updateFields"))
    if old is not None:
        settings.remove(old)
    el = OxmlElement("w:updateFields")
    el.set(qn("w:val"), "true")
    settings.insert(0, el)
    tfl = settings.find(q("themeFontLang"))
    if tfl is not None:
        tfl.set(qn("w:eastAsia"), "zh-CN")

    doc.core_properties.title = f"{NEW_NAME} {SUBTITLE} 商业计划书"
    doc.core_properties.author = NEW_NAME
    doc.core_properties.subject = SUBTITLE
    doc.core_properties.comments = ""

    doc.save(OUT_DOCX)
    os.remove(OUT_DOCX + ".bak")
    print(f"\n[完成] 输出：{OUT_DOCX}")
    print(f"[完成] 图表占位 {len(inserted)}/{len(FIGURES)} 个")
    return OUT_DOCX


# ----------------------------------------------------------------------------
# 目录重建
# ----------------------------------------------------------------------------
TOC_LEVEL3 = re.compile(r"^(3\.1\.[12]|4\.2\.\d)\s")


def toc_entries(doc):
    out = []
    for p in doc.paragraphs:
        st = p.style.name
        txt = p.text.strip()
        if not txt:
            continue
        if st == "Heading 1":
            level = 0
        elif st == "Heading 2":
            level = 2 if TOC_LEVEL3.match(txt) else 1
        elif st in ("Heading 3", "Heading 4"):
            level = 2
        else:
            continue
        if txt == "目录":
            continue
        out.append((level, txt, p))
    return out


def rebuild_toc(doc, sdt):
    content = sdt.find(q("sdtContent"))
    for ch in list(content):
        content.remove(ch)

    def add_xml_p(style_id=None, tab_leader=False, align_center=False):
        p = OxmlElement("w:p")
        pPr = OxmlElement("w:pPr")
        if style_id:
            ps = OxmlElement("w:pStyle")
            ps.set(qn("w:val"), style_id)
            pPr.append(ps)
        else:
            sp = OxmlElement("w:spacing")
            sp.set(qn("w:before"), "0")
            sp.set(qn("w:after"), "0")
            sp.set(qn("w:line"), "300")
            sp.set(qn("w:lineRule"), "auto")
            pPr.append(sp)
        if tab_leader:
            tabs = OxmlElement("w:tabs")
            tab = OxmlElement("w:tab")
            tab.set(qn("w:val"), "right")
            tab.set(qn("w:leader"), "dot")
            tab.set(qn("w:pos"), "8640")
            tabs.append(tab)
            pPr.append(tabs)
        if align_center:
            jc = OxmlElement("w:jc")
            jc.set(qn("w:val"), "center")
            pPr.append(jc)
        p.append(pPr)
        content.append(p)
        return p

    def add_run(p, text=None, font=BODY_FONT, size=Pt(11), bold=False,
                color=None, tab=False, field=None):
        r = OxmlElement("w:r")
        rPr = OxmlElement("w:rPr")
        rf = OxmlElement("w:rFonts")
        latin = "Times New Roman" if font == BODY_FONT else font
        rf.set(qn("w:ascii"), latin)
        rf.set(qn("w:hAnsi"), latin)
        rf.set(qn("w:eastAsia"), font)
        rPr.append(rf)
        if bold:
            rPr.append(OxmlElement("w:b"))
        sz = OxmlElement("w:sz")
        sz.set(qn("w:val"), str(int(size.pt * 2)))
        rPr.append(sz)
        if color:
            c = OxmlElement("w:color")
            c.set(qn("w:val"), color)
            rPr.append(c)
        r.append(rPr)
        if tab:
            r.append(OxmlElement("w:tab"))
        if field:
            fc = OxmlElement("w:fldChar")
            fc.set(qn("w:fldCharType"), field if field in ("begin", "separate", "end") else "begin")
            if field.startswith("instr:"):
                it = OxmlElement("w:instrText")
                it.set(qn("xml:space"), "preserve")
                it.text = field[6:]
                r.append(it)
            else:
                r.append(fc)
        if text is not None:
            t = OxmlElement("w:t")
            t.set(qn("xml:space"), "preserve")
            t.text = text
            r.append(t)
        p.append(r)
        return r

    # 标题「目录」
    tp = add_xml_p(align_center=True)
    add_run(tp, "目录", HEAD_FONT, Pt(16), True)

    # TOC 域起点
    fp = add_xml_p(tab_leader=True)
    add_run(fp, field="begin")
    r = OxmlElement("w:r")
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = ' TOC \\o "1-3" \\h \\z \\u '
    r.append(it)
    fp.append(r)
    add_run(fp, field="separate")

    entries = toc_entries(doc)
    bid = 80000
    for level, txt, p in entries:
        bm = f"_Toc{bid}"
        add_bookmark(p, bm, bid)
        ep = add_xml_p(style_id=["26", "29", "36"][level] if level < 3 else "36",
                       tab_leader=True)
        add_run(ep, field="begin")
        r = OxmlElement("w:r")
        it = OxmlElement("w:instrText")
        it.set(qn("xml:space"), "preserve")
        it.text = f" HYPERLINK \\l {bm} "
        r.append(it)
        ep.append(r)
        add_run(ep, field="separate")
        add_run(ep, txt, BODY_FONT, Pt(11) if level else Pt(11.5), level == 0)
        add_run(ep, tab=True)
        add_run(ep, field="begin")
        r = OxmlElement("w:r")
        it = OxmlElement("w:instrText")
        it.set(qn("xml:space"), "preserve")
        it.text = f" PAGEREF {bm} \\h "
        r.append(it)
        ep.append(r)
        add_run(ep, field="separate")
        add_run(ep, "1", BODY_FONT, Pt(11))
        add_run(ep, field="end")
        add_run(ep, field="end")
        bid += 1

    add_run(fp, field="end")
    content.append(OxmlElement("w:p"))
    return len(entries)


if __name__ == "__main__":
    main()
