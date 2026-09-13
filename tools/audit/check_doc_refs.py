#!/usr/bin/env python3
"""校验 Markdown 里引用的仓库路径是否真实存在。

用法:
    python3 tools/audit/check_doc_refs.py [md 文件...] [--all]
    不带参数：扫描本仓库自有文档（根 *.md + docs/*.md），跳过上游文档（ROADMAP/TODO）
    --all  ：连上游文档一起扫

判定规则（避免误报）：
    - 只检查 `反引号` 内以 src/ server/ docs/ tools/ 开头的 token
    - 剥离尾部行号（:321 / :310-387 / :310–387，含 en dash）
    - 跳过含 * 的 glob（如 server/seed*.ts）
    - 上下文 ±4 行内出现「建议/新增/新建/落点/待建/计划/黑名单/不存在/禁止引用」→ 视为计划路径或声明，跳过
退出码：0=无幽灵引用；1=有幽灵引用
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP_DOCS = {"ROADMAP.md", "TODO.md"}          # 上游自带，引用其自身文档，不归我们管
ALLOW_MARKERS = (
    "黑名单", "不存在", "勿再出现", "勿再沿用", "禁止引用",
    "建议", "新增", "新建", "落点", "待建", "计划", "待实现", "地基",
)
LINE_SUFFIX = re.compile(r":\d+(?:[-\u2013\u2014]\d+)?$")


def doc_files(argv):
    if argv:
        return [Path(a) for a in argv]
    out = sorted(p for p in ROOT.glob("*.md") if p.name not in SKIP_DOCS)
    docs = ROOT / "docs"
    if docs.is_dir():
        out += sorted(docs.glob("*.md"))
    return out


def main():
    argv = [a for a in sys.argv[1:] if a != "--all"]
    scan_all = "--all" in sys.argv
    files = doc_files(argv)
    if scan_all:
        files = sorted(ROOT.glob("*.md")) + sorted((ROOT / "docs").glob("*.md"))

    total = bad = 0
    for f in files:
        lines = f.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines, 1):
            for token in re.findall(r"`([^`]+)`", line):
                for piece in re.split(r"[\s、,，+]+", token):
                    piece = LINE_SUFFIX.sub("", piece.strip().rstrip("/"))
                    if not piece.startswith(("src/", "server/", "docs/", "tools/")):
                        continue
                    if piece.endswith("...") or "*" in piece:
                        continue
                    total += 1
                    if (ROOT / piece).exists():
                        continue
                    window = "\n".join(lines[max(0, i - 5):i + 4])
                    if any(m in window for m in ALLOW_MARKERS):
                        continue
                    print("MISS  {}:{}  {}".format(f.relative_to(ROOT), i, piece))
                    bad += 1
    print("检查路径引用 {} 处，幽灵引用 {} 处".format(total, bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
