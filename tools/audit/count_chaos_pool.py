#!/usr/bin/env python3
"""量命运轮盘事件池：条数、五风味配额、spicy 配额、重复文案。

用法:
    python3 tools/audit/count_chaos_pool.py            # 出报告
    python3 tools/audit/count_chaos_pool.py --check     # 同时校验 P1-3 验收线（不达标 exit 1）

口径说明（P1-3 验收）：总条数 >= 150；五风味各 >= 24；spicy >= 30；无重复文案。
数字一律来自本脚本实测，不手写进文档。

与 `tools/audit/count_scale.py` 的关系：总数与 spicy 数两边一致（都从 engine.ts 解析），
本脚本的增量价值只有三样——逐风味配额、归一化查重、`--check` 退出码。改解析口径时两个一起改。
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "src" / "lib" / "realism" / "engine.ts"

FLAVORS = ["fortune", "misfortune", "chaos", "wild", "slapstick"]
FLAVOR_LABEL = {
    "fortune": "🟢 幸运",
    "misfortune": "🔴 厄运",
    "chaos": "💛 混乱",
    "wild": "💜 离谱",
    "slapstick": "🎪 滑稽",
}

# P1-3 acceptance line.
MIN_TOTAL = 150
MIN_PER_FLAVOR = 24
MIN_SPICY = 30

ENTRY_RE = re.compile(
    r"\{\s*text:\s*'(?P<text>(?:[^'\\]|\\.)*)'\s*,\s*"
    r"flavor:\s*'(?P<flavor>[a-z]+)'\s*(?P<rest>[^}]*)\}",
)

TAG_RE = re.compile(r"\{\{char\}\}|\{\{user\}\}")


def strip_comments(source: str) -> str:
    """去掉行注释，免得注释里出现的示例条目被算进池子。"""
    return "\n".join(line.split("//")[0] for line in source.splitlines())


def normalize(text: str) -> str:
    """归一化用于查重：去占位差异、去空白与标点、全角转半角。"""
    plain = TAG_RE.sub("_", text)
    plain = unicodedata.normalize("NFKC", plain)
    return re.sub(r"[\s，。、！？：；“”‘’（）《》…—－·,.!?:;\"'()<>-]+", "", plain)


def load_entries() -> list[tuple[str, str, bool]]:
    source = strip_comments(ENGINE.read_text(encoding="utf-8"))
    start = source.find("export const CHAOS_EVENTS")
    if start < 0:
        raise SystemExit(f"找不到 CHAOS_EVENTS：{ENGINE}")
    body = source[start:]
    entries = []
    for m in ENTRY_RE.finditer(body):
        text = m.group("text").replace("\\'", "'")
        spicy = "spicy: true" in m.group("rest")
        entries.append((text, m.group("flavor"), spicy))
    return entries


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="按 P1-3 验收线校验，不达标 exit 1")
    args = ap.parse_args()

    entries = load_entries()
    if not entries:
        raise SystemExit("CHAOS_EVENTS 解析出 0 条，解析口径要更新了")

    per_flavor = Counter(flavor for _, flavor, _ in entries)
    spicy = [e for e in entries if e[2]]
    base = [e for e in entries if not e[2]]

    seen: dict[str, list[int]] = {}
    for i, (text, _, _) in enumerate(entries):
        seen.setdefault(normalize(text), []).append(i)
    dups = {k: v for k, v in seen.items() if len(v) > 1}

    def pct(part: int, whole: int) -> str:
        return f"{100.0 * part / whole:.0f}%"

    print("命运轮盘事件池实测（口径：src/lib/realism/engine.ts 的 CHAOS_EVENTS）")
    print(f"  总条数      {len(entries)}")
    print(f"  默认池      {len(base)}（{pct(len(base), len(entries))}）")
    print(f"  spicy 池    {len(spicy)}（{pct(len(spicy), len(entries))}，默认关闭）")
    print()
    print("  风味分布")
    for flavor in FLAVORS:
        n = per_flavor.get(flavor, 0)
        ns = sum(1 for _, f, s in entries if f == flavor and s)
        flag = "✅" if n >= MIN_PER_FLAVOR else "❌"
        print(f"    {flag} {FLAVOR_LABEL[flavor]:<6} {n:>3} 条（其中 spicy {ns}）")
    unknown = {f: c for f, c in per_flavor.items() if f not in FLAVORS}
    if unknown:
        print(f"    ⚠️  未知风味：{unknown}")

    print()
    print(f"  重复文案    {len(dups)} 组")
    for key, idx in list(dups.items())[:10]:
        print(f"    ❌ 第 {[i + 1 for i in idx]} 条归一化后相同：{entries[idx[0]][0][:40]}")

    print()
    missing_tags = [
        (i + 1, text)
        for i, (text, _, _) in enumerate(entries)
        if "{{char}}" not in text and "{{user}}" not in text
    ]
    print(f"  纯场景条目  {len(missing_tags)} 条（用「两人」指代，不含占位符——信息项，非缺陷）")
    for n, text in missing_tags[:3]:
        print(f"    ℹ️  第 {n} 条：{text[:40]}")

    ok = (
        len(entries) >= MIN_TOTAL
        and all(per_flavor.get(f, 0) >= MIN_PER_FLAVOR for f in FLAVORS)
        and len(spicy) >= MIN_SPICY
        and not dups
    )
    if args.check:
        print()
        print("验收线：总 >= {} / 各风味 >= {} / spicy >= {} / 无重复 -> {}".format(
            MIN_TOTAL, MIN_PER_FLAVOR, MIN_SPICY, "PASS" if ok else "FAIL"))
        return 0 if ok else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
