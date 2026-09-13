# FP 吸收计划与项目状态（中文版工作文档）

> 本文档记录本项目相对上游（pnotisdev/rp）的全部改造、Front Porch AI（linux4life1/front-porch-AI）
> 机制的吸收进度与审计结论。每次续工前先读本文档。
>
> **文档分工（2026-09-13 起）**：项目现状 → `PROJECT_SUMMARY.md`；**待办与排期唯一源 → `DEVELOPMENT_PLAN.md`**；本文只负责「相对上游的改造 + FP 吸收进度」。

## 一、部署与运维速查

| 项 | 值 |
|---|---|
| 源码 | `~/apps/rp-master`（上游 zip 解压，非 git） |
| 启动 | `npm run dev`（客户端 `vite --host`，服务端 `tsx watch server/index.ts`） |
| 地址 | 电脑 `http://localhost:5173` · 手机 `http://<本机局域网IP>:5173` |
| 鉴权 | 口令登录（`data/config.json` → authPasscode，自行设置，勿提交仓库） |
| LLM | 全云端：自建 new-api 网关，key 在 `data/config.json` → llmApiKey，服务端统一转发 |
| 常用模型 | `deepseek-v4-flash`（实测中文 RP 好）、`kimi-k3`、`minimax-m3`；TTS/生图通道未开通 |
| 测试 | `npm test`（**116 测试文件 / ~2156 用例**，2026-09-13 实测）、`npm run typecheck` |
| 客户端连接设置 | Backend = OpenAI-compatible，Base URL = `/api/llm/v1`（走服务端代理），key 留空 |

## 二、已完成改造（相对上游）

1. **鉴权**（`server/llmProxy.ts`）：口令登录 + 会话 cookie，保护 `/api` 与 `/avatars`；`/login.html` 登录页；客户端 401 自动跳登录。注意：会话为**确定性 HMAC cookie**（passcode 派生，**重启不掉登录**，改口令即全体失效）。
   ✅ 头注释已与实现对齐（`11a4269`，关闭 `DEVELOPMENT_PLAN.md` P0-2）。
2. **LLM 代理**：`/api/llm/*` → 网关，key 只存服务端；SSE 流式透传；**必须挂在 express.json 之前**（否则 POST body 被消费，代理永久挂起——已修，勿动挂载顺序）。
3. **PWA**：`vite-plugin-pwa` + 中文 manifest + 图标（`public/icons/`）；`/api` 不缓存。
4. **局域网**：服务端绑 `0.0.0.0`，vite `--host`，内网 Origin 放行（`server/index.ts` 里默认 `RP_ALLOWED_ORIGINS=*`）。
5. **i18n 模块**（`src/lib/i18n/`）：中文词典 **203 条**（口径：引号键计数）；`en.ts` **故意留空**（英文即源字符串，`t()` 缺失即回落——不是缺口，别去补词条），设置页语言切换器（localStorage `rp.locale`，默认中文），`t()` 支持 `{name}` 插值。
6. **提示词中文化**：`src/lib/prompt/systemPrompts.ts` 全部 10 个预设改为中文，并追加语言跟随规则（角色用用户的语言回复）。
7. **Sumire 角色卡已汉化**（数据库内），新建聊天即全中文语境。

## 三、FP 机制吸收进度

代码在 `src/lib/realism/engine.ts`（纯物理：类型+公式+引导文案，"LLM 提议、代码裁决"），状态存在每角色 `RelationshipTrack.realism` 字段。

| 机制 | 状态 |
|---|---|
| 承诺账本（守诺 +12 信/+6 感，违诺 −22/−10，上限 3 条） | ✅ 实现 |
| 信任修复窗口（单轮 ≥20 损失武装，真诚修复返还一半） | ✅ 实现 |
| 双层 Bond（长期 1/8 速爬升 + 好感每 10 回合向中性漂移） | ✅ 实现 |
| 情绪强度（mild/moderate/strong） | ✅ 实现 |
| 心结 Fixations（3 回合滞留） | ✅ 实现 |
| 七需求模拟（逐轮衰减，<35 影响 <20 强制） | ✅ 实现 |
| 成长年轮（add/reinforce/淡出/12 上限，每 5 回合判定） | ✅ 实现 |
| 命运轮盘 Chaos（压力 +5/回合，**70 条**中文事件：5 风味 × 12 + 10 条 spicy 默认关；`engine.ts:310–387`） | ✅ 实现 |
| 久别重逢（>12h 显示间隔提示并可选入戏） | ✅ 实现 |
| 判定器扩展（单调用顺带返回全部 realism 字段） | ✅ 实现 |
| UI：关系面板"真实感状态"卡（需求条/年轮/承诺/长期羁绊/心结） | ✅ 实现 |
| 梦境 / 自动时间流逝 / RAG / EPUB | ⏳ 未做（梦境依赖记忆积累；时间流逝与 RP 手动时钟哲学冲突，做成可选项再做） |

判定器扩展要点（relationshipAssist.ts）：`assessRelationshipMoment` 新增 `realism` 参数
（openPromises / repairPending / growthDue / existingRings / dreamDue），JSON schema 相应增加
`promiseOps` / `repairSincere` / `moodIntensity` / `growth` / `dream`，裁判超时 120 秒/次，失败自动重试一次。
本地版 `generateWithTimeout`（relationshipAssist.ts 内）与全局版（api/generateWithTimeout.ts）签名已不同，注意区分。

## 四、已知问题（下次开工优先处理）

1. ~~判定器后续回合静默失败~~ **已解决**：是判定延迟（网关慢，120s 超时+重试可达 4 分钟）+ 观察窗口过短造成的误判。实测判定器正常：承诺入账、needs 衰减、chaosPressure 累积均生效。
2. ~~浏览器缓存旧 404~~ **已修复**：llmProxy 转发响应已加 `Cache-Control: no-store`。
3. ~~会话重启丢失~~ **已修复**：改为确定性 HMAC cookie（passcode 派生），重启不掉登录；改口令即全体失效。
4. llmProxy 请求日志已增强（含 model/stream/body 大小）。BODY tee 排查日志已移除。
5. **中文文案混入英文残渣 3 处**（`src/lib/realism/engine.ts`）：`:321`（`accidentally`）、`:323`（`minimum 奖`）、`:524`（`soft 一瞬`）。**会被注入提示词**，已修（`11a4269`，关闭 `DEVELOPMENT_PLAN.md` P0-1）。
   验收：`grep -n "accidentally\|minimum 奖\|soft 一瞬" src/lib/realism/engine.ts` 无命中；`npm test` 全绿。
6. **`FIXES_TODO.md` 悬空引用**：`src/lib/types.ts` 等 6 处注释引用该文件，但仓库内**不存在**（上游未随包分发）。
7. **源码注释 GBK/UTF-8 误码（乱码）**：英文注释里的破折号 `—` 变成 `鈥?`，**30 行 / 2 文件**（`MessageBubble.tsx` 17 行、`ChatsPanel.tsx` 13 行）。扫描器：`tools/audit/scan_cjk_pollution.py`（MOJIBAKE 分类）。已修（`11a4269`，关闭 `DEVELOPMENT_PLAN.md` P0-4，扫描 0 命中）。
8. **文档失真已修正（2026-09-13 全量对账）**：本文件原写 Chaos「24 个」**实为 70 条**；旧 `PROJECT_SUMMARY.md` / `DEVELOPMENT_PLAN.md` 引用了 5 个**不存在**的文件路径，两份文档已按真实代码刷新。

## 五、第三期吸收审计（2026-09-13，FP 用户手册/发布日志/剩余源码深挖）

深挖确认 FP 后期功能的共同地基是 **Journal 日记系统**（journal_* 约 70K 源码 + memory 查询 18K + RAG 注入 20K）：
角色自己写日记，条目带确定性情绪物理（热度冷却、闪光灯记忆抗冷却、心境一致性召回打分、显著事件触发补写）。
FP 的梦境、"Our Story"时间线、承诺账本（日记卡片的 metadata.kind='promise'）全部挂在它上面。

### 未吸收机制清单（按价值排序）

| # | 机制 | 说明 | 估量 |
|---|---|---|---|
| 1 | ~~Journal 日记系统~~ **✅ 已吸收**（2026-09-13）：`realism/engine.ts` 的 journal 物理层（每回合冷却 ×0.94、闪光灯记忆 ×0.97 带下限、心境一致性召回打分、24 条上限、判定 newFacts/强波动自动落日记）+ 提示词注入 + 关系面板"她的日记"展示 + 8 个单元测试。梦境/时间线后续可挂上来 | ✅ 已吸收 |
| 2 | **自动时间流逝** | 每轮判时长（上限 3h、胡说漂 5min、12 轮不动强制推进）、六时段日历、OOC 跳时（RP 已有 detectNarratedPhase 可接） | 3~5 天 |
| 3 | **Chaos 事件池扩容** | 我们 **70 条**（2026-09-13 实测修正，原文档误写 24）vs FP 150+（五种口味 + 30 spicy）；事件不可重摇逃逸 | 1 天 |
| 4 | **成长回写角色卡（AI Enhance）** | 把聊天里长出的年轮烘焙进角色卡，新聊天可用——"养成的角色带走" | 2~3 天 |
| 5 | **Clock In 职业班表** | 职业/哪几天/几点到几点；跳回合横幅"她在上班"；夜跳让她休息 | 2~3 天 |
| 6 | **小时级天气引擎** | 一天内天气变化、真实温度曲线、明日预报（角色能说"明天有雨"）、世界大气/重力规则 | 1 周 |
| 7 | **EPUB 导出 + 有声书** | 聊天变书/变有声书 | 2~3 天 |
| 8 | **角色生成器深度版** | 语音访谈式提问、三阶段联动世界书、立绘否决门 | 1 周 |
| 9 | **斜杠命令**（/image /skip 等） | chat_command_handler 30K | 3~5 天 |
| 10 | **图片工作流** | 聊天内 /image、图生图 Edit、Image Studio | 1 周 |
| 11 | **动态客串 NPC** | cast_detector 自动发现路人并入戏 | 1 周 |
| 12 | **记忆反鹦鹉 + 去重** | 召回不复读用户原话、重复记忆不挤占提示词 | 2 天 |
| 13 | **BYAF 导入 / ST JSONL 导出** | 格式互通 | 1~2 天 |

不推荐：Stoop 社区、本地推理全家桶、tool-calling 传输优化（云模型场景收益低）。

### 已确认覆盖（无需再做）

Impersonate、Branching/Fork、Prompt Inspector、ST 卡导入、每聊天主题预设、输出正则（Output Sanitizer）、
Afterglow、喜欢/讨厌清单（profile.likes + weatherPreferences）、礼物/衣柜、群聊导演、角色生日（礼物加成）、
角色主动发消息（outreach）、分章小说、AI 角色生成（v1 简版）。

## 六、下一步计划（按序）

> **排期与验收标准以 `DEVELOPMENT_PLAN.md` 为唯一口径**，本节只保留吸收线的顺序建议。

1. **纠偏**：3 处文案英文残渣 + `server/llmProxy.ts` 头注释同步（`DEVELOPMENT_PLAN.md` P0）。
2. **手机实测**吸收效果回归（判定器、承诺账本、需求衰减、日记召回）。
3. **TTS 通道打通**：前端 `src/lib/voice/cloudTts.ts:43` 已打 `/api/llm/v1/audio/speech`，只差自己的网关开路由（P1-4）。
4. **P1 吸收推进**：成长回写（§五 第 4 项）→ 自动时间流逝（第 2 项，做成可选项以尊重手动时钟哲学）→ Chaos 扩容（第 3 项，70 → 150+）。
5. **VPS → 安卓 APK**（分发线，见 `DEVELOPMENT_PLAN.md` P5）。

> 原第 1、2 项已完成：判定器静默失败 = 判定延迟误判（实测正常）；加固三项（no-store / HMAC 会话 / BODY tee 移除）均已完成。

## 七、上游同步注意

本仓库已带以下本地补丁，从上游拉新代码后需 rebase/重打：i18n 模块、llmProxy+鉴权、PWA 配置、
systemPrompts 中文版、realism 引擎、RelationshipPanel/Composer/ChatWindow/ChatsPanel 等组件改动、
Sumire 卡在数据库（不在代码里）。

## 八、文档纪律（2026-09-13 起）

1. 本文只写「相对上游的改造 + FP 吸收进度」，**不再维护待办清单**（唯一源：`DEVELOPMENT_PLAN.md`）。
2. **禁止引用未实测的路径**。历史黑名单（**不存在**，勿再出现）：`src/lib/journal.ts`、`src/lib/journal.test.ts`、
   `src/lib/chaos-events.ts`、`src/lib/chaos-events.test.ts`、`src/components/chat/JournalPanel.tsx`、
   `src/lib/relationshipValidator.ts`、`src/lib/characterCard.ts`。
3. **数字必须实测**：写条数 / 行数 / 测试数时注明口径与日期（禁止估算）。
4. 吸收完成一项：本表状态改为「✅ 已吸收」，并在 `PROJECT_SUMMARY.md` 同步模块地图与规模基线。
5. 对账脚本（可复跑）目前在仓库外 `koibito-ai-tools/`，**建议收进仓库 `tools/audit/`**。
