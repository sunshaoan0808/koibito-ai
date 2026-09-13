#!/usr/bin/env python3
"""源码文本体检：中文文案里的英文残渣 + GBK/UTF-8 误码（乱码）。

用法: python3 tools/audit/scan_cjk_pollution.py [目录或文件...]   默认扫 src/ 与 server/
退出码：0=干净；1=有残渣或乱码

分类：
    MOJIBAKE   GBK 误码（如「—」被写成「鈥?」）——必修
    POLLUTION  译后未校对的英文单词（纯小写、非技术词、不挨着符号/宏）
    INFO       大写开头的英文（多为专有名词，仅提示）

抑制误报的三条规则：
    1) 含乱码的行只报 MOJIBAKE，不再做英文残渣分析（乱码会把英文注释误判成中文行）
    2) 模板宏 {{char}} / {name} / ${x} 先剥掉再分析
    3) 紧邻符号（等号/下划线/点/井号/@/冒号/反斜杠/连字符）的英文视为代码片段（kind=gift、/models、use_chat）
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CJK = re.compile(r"[\u4e00-\u9fff]")
MACRO = re.compile(r"\{\{.*?\}\}|\{[^}]*\}|\$\{[^}]*\}")
WORD = re.compile(r"(?<![A-Za-z0-9_/.\-=])([a-z]{4,})(?![A-Za-z0-9_])")
STR = re.compile(r"(['\"])(.*?)\1")
MOJIBAKE = re.compile(r"鈥|锛|鎴|瀹|閿|鍏|鏄|涓|浣|鍜|鍙|鏈|庡|彲|涔|欎|竴|鏂|囨|湰")
SKIP_DIRS = {".git", "node_modules", "dist", "dev-dist", "coverage"}
ALLOW = {
    "token", "tokens", "llama", "choices", "params", "kind", "gift", "hover", "json", "yaml",
    "ctrl", "shift", "cmd", "alt", "esc", "tab", "enter", "comfyui", "novelai", "swarmui",
    "koboldcpp", "persona", "whisper", "gguf", "markdown", "epub", "openai", "sillytavern",
}


def iter_files(paths):
    for p in paths:
        p = Path(p)
        if p.is_file() and p.suffix in {".ts", ".tsx"}:
            yield p
        elif p.is_dir():
            for f in p.rglob("*"):
                if f.is_file() and f.suffix in {".ts", ".tsx"} and not SKIP_DIRS & set(f.parts):
                    yield f


def main():
    args = sys.argv[1:] or [str(ROOT / "src"), str(ROOT / "server")]
    pollution = mojibake = info = 0
    seen = set()
    for f in iter_files(args):
        try:
            text = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel = f.relative_to(ROOT)
        for i, line in enumerate(text.splitlines(), 1):
            if MOJIBAKE.search(line):
                print("MOJIBAKE  {}:{}  {}".format(rel, i, line.strip()[:110]))
                mojibake += 1
                continue
            if not CJK.search(line):
                continue
            for _, literal in STR.findall(line):
                clean = MACRO.sub(" ", literal)
                if not CJK.search(clean):
                    continue
                for w in sorted(set(WORD.findall(clean))):
                    if w in ALLOW:
                        continue
                    key = (str(rel), i, w)
                    if key in seen:
                        continue
                    seen.add(key)
                    print("POLLUTION {}:{}  {}   << {} >>".format(rel, i, w, literal.strip()[:80]))
                    pollution += 1
    print("\n英文残渣 {} 处；乱码 {} 处".format(pollution, mojibake))
    return 1 if (pollution or mojibake) else 0


if __name__ == "__main__":
    sys.exit(main())
