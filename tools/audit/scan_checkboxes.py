#!/usr/bin/env python3
"""全库未勾选复选框分布统计（找出还有多少未完项、散落在哪些文档）。

用法: python3 tools/audit/scan_checkboxes.py [根目录]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOX = re.compile(r"^\s*- \[ \]")


def main():
    base = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT
    rows, detail = [], {}
    for p in sorted(base.rglob("*.md")):
        if {".git", "node_modules"} & set(p.parts):
            continue
        try:
            lines = p.read_text(encoding="utf-8").splitlines()
        except (UnicodeDecodeError, OSError):
            continue
        hits = [(i, l) for i, l in enumerate(lines, 1) if BOX.match(l)]
        if hits:
            rel = str(p.relative_to(base))
            rows.append((rel, len(hits)))
            detail[rel] = hits
    rows.sort(key=lambda x: -x[1])
    total = sum(n for _, n in rows)
    print("未勾选复选框合计：{} 项，分布在 {} 个文件".format(total, len(rows)))
    for rel, n in rows:
        print("  {:4d}  {}".format(n, rel))
    print("\n明细（每文件前 5 条）:")
    for rel, _ in rows:
        print("\n--- {} ---".format(rel))
        for i, line in detail[rel][:5]:
            print("  L{}: {}".format(i, BOX.sub("", line).strip()[:140]))


if __name__ == "__main__":
    main()
