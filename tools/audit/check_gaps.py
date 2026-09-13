#!/usr/bin/env python3
"""缺口复核：逐项检查机制是否已在代码里实现。

用法: python3 tools/audit/check_gaps.py
判定三档（不是两档），因为"代码里有调用"和"功能真能用"是两回事：
  OK      代码齐 + 不依赖外部上游，可视为已实现
  WIRED   代码已接线，但验收还要一个**外部上游**（网关/TTS/生图端点）。
          这一档**不算缺口，也不算已完成**——按 DEVELOPMENT_PLAN.md 里该行的
          挂起/恢复条件人工确认，别用本脚本的一行结论替它盖章。
  GAP     代码里找不到实现痕迹，是真缺口

历史教训：TTS（P1-4）曾因前端有 `/api/llm/v1/audio/speech` 调用点被本脚本判 OK，
但本机根本没有 TTS 上游，设置页试听不会出声。命中 ≠ 可用。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = {"node_modules", ".git", "dist", "dev-dist", "coverage"}

# (名称, 正则, 计划项, 档位)  档位：code = 纯代码可判；upstream = 还需外部上游验证
CHECKS = [
    ("成长回写角色卡", r"exportWithGrowth|rp_growth", "P1-1", "code"),
    ("自动时间流逝", r"timePassage|autoAdvanceTime|deriveElapsedPhases", "P1-2", "code"),
    ("Chaos 池 >=150 条", r"__count_events__", "P1-3", "code"),
    ("TTS 通道调用", r"/api/llm/v1/audio/speech", "P1-4", "upstream"),
    ("Clock In 职业班表", r"workSchedule|clockIn|clock_in", "P2-1", "code"),
    ("小时级天气", r"hourlyWeather|weatherByHour|hourlyForecast|getPhaseWeather|getDayPhaseWeather|getTomorrowForecast", "P2-2", "code"),
    ("EPUB 导出", r"epub|EPUB", "P2-3", "code"),
    ("斜杠命令", r"slashCommand|handleCommand\(|registerCommand\(", "P2-4", "code"),
    ("聊天内生图", r"generateSceneImage|sceneSnapshot", "P2-5", "upstream"),
    ("动态客串 NPC", r"castDetector|detectCast", "P2-6", "code"),
    ("记忆去重/反鹦鹉", r"isVerbatimEcho", "P2-7", "code"),
    ("BYAF / JSONL 互通", r"byaf|BYAF|jsonl", "P2-8", "code"),
    ("语音输入 STT", r"useDictation|SpeechRecognition|startDictation", "P5", "code"),
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
    print("机制                          判定    命中  计划项")
    print("----------------------------  ------  ----  ------")
    gaps, wired = [], []
    for name, pattern, plan, kind in CHECKS:
        if pattern == "__count_events__":
            n = event_count()
            hit = n >= 150
            verdict = "OK" if hit else "GAP"
        else:
            n = len([f for f, t in corpus if re.search(pattern, t)])
            hit = bool(n)
            verdict = ("WIRED" if kind == "upstream" else "OK") if hit else "GAP"
        if not hit:
            gaps.append(plan)
            verdict = "GAP"
        elif kind == "upstream":
            wired.append(plan)
        print("{:28s}  {:6s}  {:4d}  {}".format(name, verdict, n, plan))
    print("\n真缺口 {} 项：{}".format(len(gaps), "、".join(gaps) if gaps else "无"))
    print("待上游验证 {} 项：{}".format(len(wired), "、".join(wired) if wired else "无"))
    print("（WIRED 只说明代码接线在，不代表功能可用；口径见 DEVELOPMENT_PLAN.md 对应行）")


if __name__ == "__main__":
    main()
