# tools/audit — 文档 × 代码对账工具

本目录的工具用于**周期性对账**：防止文档描述与真实代码脱节（历史事故：文档引用了 5 个根本不存在的文件路径）。

所有脚本都是**只读**的——不修改任何源码，只打印结论。路径无关：可在仓库任意位置调用，脚本自己解析仓库根。

## 用法

```bash
# 全量提交前闸门（幽灵路径 + 敏感串）
python3 tools/audit/check_pre_commit.py

# 文档引用的路径是否真实存在
python3 tools/audit/check_doc_refs.py                 # 默认扫 *.md 与 docs/*.md
python3 tools/audit/check_doc_refs.py DEVELOPMENT_PLAN.md

# 中文文案里的英文残渣（机器翻译污染，建议进 CI）
python3 tools/audit/scan_cjk_pollution.py

# 规模基线（文件/行数/测试/事件池/模块数）
python3 tools/audit/count_scale.py
python3 tools/audit/count_chaos_pool.py --check

# 缺口复核：13 项机制是否已实现
python3 tools/audit/check_gaps.py

# 上游待办盘点
python3 tools/audit/dump_open_items.py                # TODO.md / ROADMAP.md 未勾项 + 分组
python3 tools/audit/scan_checkboxes.py                # 全库未勾选分布
```

## 退出码约定

| 脚本 | 非 0 的含义 |
|---|---|
| `check_pre_commit.py` | 发现幽灵路径引用或敏感串 → **不要提交** |
| `check_doc_refs.py` | 文档引用了不存在的路径 |
| `scan_cjk_pollution.py` | 中文文案混入英文单词 |
| `count_chaos_pool.py --check` | 命运轮盘不达 P1-3 配额（总 / 风味 / spicy / 重复文案） |
| 其余 | 恒为 0（只做报告） |

## 敏感值清单（本地私有，不入库）

`check_pre_commit.py` 只扫**本次改动**，且分两层判定：

1. **高信号模式**（形状可判定，几乎无误报）：`sk-`/`ghp_`/`AIza` 长串 key、`BEGIN PRIVATE KEY`、代码里写死的 `passcode = "..."`；
2. **本地私有清单**：`tools/audit/secrets.local.txt`（**已 gitignore**）——把你的真实口令、自建网关域名、内网网段一行一个写进去，只在本机生效，不随仓库公开。模板见 `secrets.local.example.txt`。

> 刻意**不**把「角色名 / 测试用私有 IP / `sk-test` 占位」当泄露——那类字符串在上游测试与种子数据里大量存在，写死成黑名单只会制造误报噪声。

## 维护约定

- 数字一律以这些脚本的**实测输出**为准，文档里禁止估算。
- 新增/更名模块后，跑一次 `check_pre_commit.py` + `count_scale.py`，并同步 `PROJECT_SUMMARY.md` 的模块地图与规模基线。
