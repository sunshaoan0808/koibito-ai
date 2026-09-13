#!/usr/bin/env python3
"""提交前闸门：幽灵路径 + 敏感串 + 单文件体积。

用法: python3 tools/audit/check_pre_commit.py
退出码：0=通过；1=有阻断项

扫描范围：**仅本次改动**（已修改 + 暂存 + 未跟踪），不扫全仓库历史文件。

敏感串分两层：
    1) 高信号模式（形状可判定，误报率低）：API key / 私钥 / 里写死的口令赋值
    2) 本地私有清单：tools/audit/secrets.local.txt（**已 gitignore**，一行一个具体值）
       —— 你的真实口令/网关域名等具体值放这里，不随仓库公开。
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SELF = "tools/audit/check_pre_commit.py"
LOCAL_LIST = ROOT / "tools/audit/secrets.local.txt"

PHANTOM = [
    "src/lib/journal.ts", "src/lib/journal.test.ts", "src/lib/chaos-events.ts",
    "src/lib/chaos-events.test.ts", "src/components/chat/JournalPanel.tsx",
    "src/lib/relationshipValidator.ts", "src/lib/characterCard.ts",
]
ALLOW_MARKERS = ("黑名单", "不存在", "勿再出现", "勿再沿用", "禁止引用")

# 高信号模式：形状可判定，避免把「角色名 / 测试用私有 IP / sk-test 占位」当泄露
HIGH_SIGNAL = [
    (r"sk-[A-Za-z0-9_\-]{20,}", "OpenAI 风格 key"),
    (r"ghp_[A-Za-z0-9]{20,}", "GitHub PAT"),
    (r"github_pat_[A-Za-z0-9_]{20,}", "GitHub 细粒度 PAT"),
    (r"AIza[0-9A-Za-z_\-]{30,}", "Google API key"),
    (r"xox[baprs]-[A-Za-z0-9\-]{10,}", "Slack token"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "私钥"),
    (r"passcode\s*[:=]\s*['\"][^'\"]{6,}['\"]", "硬编码口令"),
    (r"authPasscode\s*[:=]\s*['\"][^'\"]{6,}['\"]", "硬编码鉴权口令"),
]
SIZE_LIMIT_MB = 100
TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".html", ".css", ".py", ".sh", ".toml"}


def changed_files():
    """已修改 + 已暂存 + 未跟踪（排除 gitignore）。"""
    changed = subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=ROOT,
                             capture_output=True, text=True).stdout.split()
    untracked = subprocess.run(["git", "ls-files", "-o", "--exclude-standard"], cwd=ROOT,
                               capture_output=True, text=True).stdout.split()
    return sorted(set(changed + untracked))


def local_literals():
    if not LOCAL_LIST.is_file():
        return []
    return [l.strip() for l in LOCAL_LIST.read_text(encoding="utf-8").splitlines()
            if l.strip() and not l.startswith("#")]


def main():
    blocked = 0

    print("### 1. 幽灵路径引用（本仓库自有文档）")
    docs = [p for p in ROOT.glob("*.md") if p.name not in {"ROADMAP.md", "TODO.md"}]
    docs += sorted((ROOT / "docs").glob("*.md"))
    ghost = 0
    for f in docs:
        lines = f.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines, 1):
            if not any(p in line for p in PHANTOM):
                continue
            window = "\n".join(lines[max(0, i - 5):i + 4])
            if any(m in window for m in ALLOW_MARKERS):
                continue
            print("  BLOCK {}:{}  {}".format(f.relative_to(ROOT), i, line.strip()[:100]))
            ghost += 1
    blocked += ghost
    print("  -> 幽灵引用 {} 处".format(ghost))

    print("### 2. 敏感串（仅扫本次改动 {} 个文件）".format(len(changed_files())))
    literals = local_literals()
    secrets = 0
    for name in changed_files():
        if name == SELF:
            continue
        p = ROOT / name
        if not p.is_file() or p.suffix not in TEXT_SUFFIXES or p.stat().st_size > 2_000_000:
            continue
        try:
            txt = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for pattern, label in HIGH_SIGNAL:
            for m in re.finditer(pattern, txt):
                print("  BLOCK {}: {}  << {} >>".format(name, label, m.group(0)[:40]))
                secrets += 1
        for lit in literals:
            if lit in txt:
                print("  BLOCK {}: 命中本地私有清单条目（值已隐藏）".format(name))
                secrets += 1
    blocked += secrets
    print("  -> 命中 {} 处（本地私有清单 {} 条，见 tools/audit/secrets.local.txt）".format(secrets, len(literals)))

    print("### 3. 单文件体积（GitHub 硬限 {} MB）".format(SIZE_LIMIT_MB))
    big = 0
    for p in ROOT.rglob("*"):
        if ".git" in p.parts or not p.is_file():
            continue
        mb = p.stat().st_size / 1024 / 1024
        if mb > SIZE_LIMIT_MB:
            print("  BLOCK {} {:.1f} MB".format(p.relative_to(ROOT), mb))
            big += 1
    blocked += big
    print("  -> 超限 {} 个".format(big))

    print("\n结论：{}".format("可以提交" if blocked == 0 else "有 {} 项阻断，勿提交".format(blocked)))
    return 1 if blocked else 0


if __name__ == "__main__":
    sys.exit(main())
