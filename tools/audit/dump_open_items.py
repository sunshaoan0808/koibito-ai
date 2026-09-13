#!/usr/bin/env python3
"""提取 TODO.md / ROADMAP.md 里所有未勾选项，并标注所属分组。

用法: python3 tools/audit/dump_open_items.py [文件...]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOX = re.compile(r"^\s*- \[ \]")


def dump(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    heading = sub = ""
    n = 0
    print("\n{}（共 {} 行）".format("=" * 12 + " " + path.name, len(lines)))
    for i, line in enumerate(lines, 1):
        if line.startswith("## "):
            heading, sub = line.lstrip("# ").strip(), ""
        elif re.match(r"^#{3,4} ", line):
            sub = line.lstrip("# ").strip()
        if BOX.match(line):
            n += 1
            label = "{} > {}".format(heading, sub) if sub else heading
            text = BOX.sub("", line).strip()
            print("[{:02d}] L{}  ({})".format(n, i, label))
            print("     {}".format(text[:200]))
    print("---- 未勾选合计：{} 项".format(n))


def main():
    args = sys.argv[1:] or ["TODO.md", "ROADMAP.md"]
    for a in args:
        p = Path(a) if Path(a).is_absolute() else ROOT / a
        if p.is_file():
            dump(p)
        else:
            print("跳过（不存在）：{}".format(a))


if __name__ == "__main__":
    main()
