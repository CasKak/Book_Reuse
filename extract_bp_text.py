# -*- coding: utf-8 -*-
"""从商业计划书中提取全文（含表格）到 docs/_bp_extract.md，作为 PRD 设计依据。

用法：python extract_bp_text.py [源文件.docx] [输出.md]
"""
from __future__ import annotations

import sys

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

sys.stdout.reconfigure(encoding="utf-8")

SRC = sys.argv[1] if len(sys.argv) > 1 else "青阅循环_优化版.docx"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/_bp_extract.md"

doc = Document(SRC)
lines: list[str] = [f"# 商业计划书全文提取（{SRC}）\n"]

tbl_idx = 0
for ch in doc.element.body.iterchildren():
    tag = ch.tag.split("}")[-1]
    if tag == "p":
        p = Paragraph(ch, doc)
        txt = p.text.strip()
        if not txt:
            continue
        style = p.style.name
        if style == "Heading 1":
            lines.append(f"\n## {txt}\n")
        elif style == "Heading 2":
            lines.append(f"\n### {txt}\n")
        elif style == "Heading 3":
            lines.append(f"\n#### {txt}\n")
        else:
            lines.append(txt + "\n")
    elif tag == "tbl":
        t = Table(ch, doc)
        tbl_idx += 1
        lines.append(f"\n**［表 {tbl_idx}］**\n")
        for row in t.rows:
            cells = [c.text.strip().replace("\n", " ") for c in row.cells]
            lines.append("| " + " | ".join(cells) + " |\n")
        lines.append("\n")

text = "".join(lines)
import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write(text)

print(f"已写入 {OUT}")
print(f"字符数 {len(text)}，段落级行数 {len(lines)}，表格 {tbl_idx} 个")
