#!/usr/bin/env python3
"""规模基线统计（文档里的数字应以本脚本输出为准）。

用法: python3 tools/audit/count_scale.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = {"node_modules", ".git", "dist", "dev-dist", "coverage"}


def ts_files(base):
    return [p for p in base.rglob("*")
            if p.is_file() and p.suffix in {".ts", ".tsx"} and not SKIP & set(p.parts)]


def count_lines(files):
    n = 0
    for f in files:
        try:
            n += len(f.read_text(encoding="utf-8").splitlines())
        except (UnicodeDecodeError, OSError):
            pass
    return n


def chaos_events():
    src = ROOT / "src/lib/realism/engine.ts"
    if not src.is_file():
        return 0, 0
    text = src.read_text(encoding="utf-8")
    start = text.find("export const CHAOS_EVENTS")
    if start < 0:
        return 0, 0
    end = text.find("\n]", start)
    region = text[start:end]
    return len(re.findall(r"\{ text:", region)), len(re.findall(r"spicy: true", region))


def main():
    code = ts_files(ROOT / "src") + ts_files(ROOT / "server")
    tests = [f for f in code if ".test." in f.name]
    dating = ROOT / "src/lib/dating"
    dating_mods = [p for p in dating.glob("*.ts") if ".test." not in p.name] if dating.is_dir() else []
    dating_tests = list(dating.glob("*.test.ts")) if dating.is_dir() else []
    ui = ROOT / "src/components/ui"
    ui_files = [p for p in ui.glob("*.tsx")] if ui.is_dir() else []
    zh = ROOT / "src/lib/i18n/zh.ts"
    zh_entries = 0
    if zh.is_file():
        zh_entries = len(re.findall(r"^\s*'[^']+':", zh.read_text(encoding="utf-8"), re.M))
    events, spicy = chaos_events()
    cases = 0
    for f in code:
        try:
            cases += len(re.findall(r"^\s*(it|test)\(", f.read_text(encoding="utf-8"), re.M))
        except (UnicodeDecodeError, OSError):
            pass

    print("指标                              实测值")
    print("--------------------------------  ------------------")
    print("src+server 的 TS/TSX 文件数       {}".format(len(code)))
    print("src+server 代码行数               {}".format(count_lines(code)))
    print("测试文件数                        {}".format(len(tests)))
    print("测试用例数                        {}".format(cases))
    print("约会/亲密机制模块数               {}".format(len(dating_mods)))
    print("约会/亲密测试数                   {}".format(len(dating_tests)))
    print("UI 基础件数                       {}".format(len(ui_files)))
    print("i18n 中文词条数                   {}".format(zh_entries))
    print("Chaos 事件池                      {}（其中 spicy {}）".format(events, spicy))


if __name__ == "__main__":
    main()
