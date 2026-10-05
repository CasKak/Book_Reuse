# -*- coding: utf-8 -*-
"""对比源文件与当前「青阅循环_优化版.docx」，列出用户手工改动。"""
import sys

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

sys.stdout.reconfigure(encoding="utf-8")


def outline(path):
    doc = Document(path)
    items = []
    for ch in doc.element.body.iterchildren():
        tag = ch.tag.split("}")[-1]
        if tag == "p":
            p = Paragraph(ch, doc)
            t = p.text.strip()
            if t:
                items.append(("P", p.style.name, t))
        elif tag == "tbl":
            tb = Table(ch, doc)
            items.append(("T", f"{len(tb.rows)}x{len(tb.columns)}",
                          tb.rows[0].cells[0].text.strip()[:70]))
        else:
            items.append((tag, "", ""))
    return doc, items


cur, cur_items = outline("青阅循环_优化版.docx")
print("当前文档：段落 %d，表格 %d，节 %d"
      % (len(cur.paragraphs), len(cur.tables), len(cur.sections)))

print()
print("=== 末尾 8 个块 ===")
for kind, style, txt in cur_items[-8:]:
    print(f"  {kind} [{style}] {txt[:100]}")

print()
print("=== 图片 / 绘图对象 ===")
for i, p in enumerate(cur.paragraphs):
    x = p._p.xml
    if "w:drawing" in x or "pic:pic" in x:
        print(f"  段落{i}: {p.text.strip()[:60]!r} 有图片")

print()
print("=== 含『待填写 / 待补充 / 一句话总结』的段落 ===")
for i, p in enumerate(cur.paragraphs):
    t = p.text.strip()
    if any(k in t for k in ("待填写", "项目一句话总结", "待补充数据")):
        print(f"  [{i:03d}] [{p.style.name}] {t[:90]}")

import zipfile
with zipfile.ZipFile("青阅循环_优化版.docx") as z:
    names = z.namelist()
    print()
    print("=== 包内媒体 ===")
    for n in names:
        if "media" in n:
            print(f"  {n}  {z.getinfo(n).file_size} bytes")
    print("=== 头部/尾部部件 ===")
    for n in names:
        if "header" in n or "footer" in n:
            print(f"  {n}")
