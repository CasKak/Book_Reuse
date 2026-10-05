#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""以 UTF-8（无 BOM）写入 git 提交信息文件。

为什么需要这个工具
------------------
在 Windows PowerShell 中执行 `... | Out-File -Encoding utf8` 会写入 UTF-8 BOM
（字节 EF BB BF）。git 会把 BOM 当作提交信息的一部分，导致：

    git log --oneline
    # 显示为：﻿feat: xxx      ← 行首多出一个不可见字符

用本工具生成信息文件，再交给 `git commit -F <file>`，可彻底避免该问题。

用法
----
方式一（推荐，信息写在调用脚本里）：

    from tools.git_commit import write_message
    write_message('_msg.txt', 'feat(market): 实现图书筛选')

方式二（命令行，从标准输入读取）：

    python tools/git_commit.py _msg.txt < _msg_content.txt

方式三（PowerShell here-string，需注意换行符）：

    $msg = @"
    feat(market): 实现图书筛选

    - 支持按学校/专业/课程筛选
    "@
    $msg -replace "`r`n", "`n" | python tools/git_commit.py _msg.txt
"""
from __future__ import annotations

import sys
from pathlib import Path

# 提交信息中的换行统一为 LF，避免 Windows CRLF 进入 git 对象
_LF = '\n'


def write_message(path: str | Path, text: str) -> bytes:
    """写入 UTF-8 无 BOM 的提交信息文件，返回写入的原始字节。

    Args:
        path: 目标文件路径（通常是仓库根目录下的临时文件）。
        text: 完整提交信息，可含多行。

    Returns:
        写入文件的原始字节内容。

    Raises:
        RuntimeError: 写入结果意外包含 BOM 时抛出，防止带 BOM 的提交信息流入 git。
    """
    normalized = text.replace('\r\n', _LF).replace('\r', _LF)
    if not normalized.strip():
        raise ValueError('提交信息为空，拒绝写入')

    target = Path(path)
    with target.open('w', encoding='utf-8', newline=_LF) as handle:
        handle.write(normalized)

    raw = target.read_bytes()
    if raw.startswith(b'\xef\xbb\xbf'):
        raise RuntimeError('写入结果含 UTF-8 BOM，请检查编码设置')

    return raw


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1

    text = sys.stdin.read()
    if not text.strip():
        print('错误：标准输入为空，未写入任何内容。', file=sys.stderr)
        return 1

    raw = write_message(argv[1], text)
    first_line = text.strip().splitlines()[0]
    print(f'已写入 {argv[1]}：{len(raw)} 字节，无 BOM')
    print(f'首行：{first_line}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
