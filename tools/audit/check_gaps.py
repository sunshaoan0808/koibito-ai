#!/usr/bin/env python3
"""缺口复核：逐项检查机制是否已在代码里实现。

用法: python3 tools/audit/check_gaps.py
说明: 命中 = 已有实现痕迹；GAP = 未实现（对应 DEVELOPMENT_PLAN.md 的待办项）
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = {"node_modules", ".git", "dist", "dev-dist", "coverage"}

CHECKS = [
    ("成长回写角色卡", r"exportWithGrowth|rp_growth", "P1-1"),
    ("自动时间流逝", r"timePassage|autoAdvanceTime|deriveElapsedPhases", "P1-2"),
    ("Chaos 池 >=150 条", r"__count_events__", "P1-3"),
    ("TTS 通道调用", r"/api/llm/v1/audio/speech", "P1-4"),
    ("Clock In 职业班表", r"workSchedule|clockIn|clock_in", "P2-1"),
    ("小时级天气", r"hourlyWeather|weatherByHour|hourlyForecast", "P2-2"),
    ("EPUB 导出", r"epub|EPUB", "P2-3"),
    ("斜杠命令", r"slashCommand|handleCommand\(|registerCommand\(", "P2-4"),
    ("聊天内生图", r"generateSceneImage|sceneSnapshot", "P2-5"),
    ("动态客串 NPC", r"castDetector|detectCast", "P2-6"),
    ("记忆去重/反鹦鹉", r"isVerbatimEcho", "P2-7"),
    ("BYAF / JSONL 互通", r"byaf|BYAF|jsonl", "P2-8"),
    ("语音输入 STT", r"useDictation|SpeechRecognition|startDictation", "P5"),
]


def files():
    out = []
    for base in (ROOT / "src", ROOT / "server"):
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.is_file() and p.suffix in {".ts", ".tsx"} and not SKIP & set(p.parts):
                out.append(p)
    return out


def event_count():
    src = ROOT / "src/lib/realism/engine.ts"
    if not src.is_file():
        return 0
    text = src.read_text(encoding="utf-8")
    start = text.find("export const CHAOS_EVENTS")
    if start < 0:
        return 0
    return len(re.findall(r"\{ text:", text[start:text.find("\n]", start)]))


def main():
    corpus = [(f, f.read_text(encoding="utf-8", errors="ignore")) for f in files()]
    print("机制                          判定   命中  计划项")
    print("----------------------------  ------  ----  ------")
    total_gap = 0
    for name, pattern, plan in CHECKS:
        if pattern == "__count_events__":
            n = event_count()
            verdict = "OK" if n >= 150 else "GAP(池={})".format(n)
        else:
            hits = [f for f, t in corpus if re.search(pattern, t)]
            n = len(hits)
            verdict = "OK" if n else "GAP"
        if not verdict.startswith("OK"):
            total_gap += 1
        print("{:28s}  {:6s}  {:4d}  {}".format(name, verdict, n, plan))
    print("\n仍缺 {} 项（明细与验收标准见 DEVELOPMENT_PLAN.md）".format(total_gap))


if __name__ == "__main__":
    main()
