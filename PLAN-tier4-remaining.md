# Tier 4 余项设计方案（含我的推荐顺序）

> 作者：哈雷酱 · 2026-09-14 · 状态：**方案待你点头/或直接按推荐执行**
> 前置已完成：内联素材解析器 + `Character.assets` + 渲染接线（`da94c1f`/`ab17b41`/`bf1a34b`）

---

## ⭐ 推荐第 1 刀：`Character.assets` 的作者 UI（性质：补上"没人能用"的缺口）

**问题（我上一轮没意识到的）**：功能接线完整 ≠ 可用。现在要给角色加内联素材**只能手改 JSON** ✗ ——
作者在界面里**没有任何入口** ✗。这是"机制已备、无人可用"，比"机制没有消费者"更糟。

- **语义决策（我定）**：不做新页面。在**角色编辑器的 Visual novel 页**加一节「Inline assets」，
  与 `Expressions`/`Outfits` 同层（那里已是"这个角色的图"的归属地 ✓）
- **落点**：`components/characters/CharacterEditor.tsx` 的 `tab === 'vn'` 块（`Expressions` 节之后）；
  行编辑复用既有 `ListEditor`（quick replies 已用同一范式 ✓，不新造控件）
- **键值形态**：`name`（作者在消息里写 `{{image::name}}`）+ `url/data-url`；**保存时用
  `normalizeTags` 式的归一化**（trim + 去空 + 大小写不敏感去重 ← 解析器已是大小写不敏感 ✓）
- **成本**：中低（1 个节 + 复用 ListEditor + 1 个纯归一化函数 + 测试）· **风险：低**（纯附加 ✓ 零迁移 ✓）
- **验收**：单测（归一化/去重）✓；tsc 全绿 ✓；真机验收**需要你**（浏览器实测打到生产 ✗，见 skill），
  或者你在界面上加一条、发一条 `{{image::}}` 消息自己看 ✓

## 推荐第 2 刀：导出路径（规格已备，含一处非显然约束）

`export/chatTranscript.ts` 的 `buildChatTranscriptHtml` 承诺**自包含可离线**（头像已内联 data URL），
所以内联素材也必须内联。**关键设计（比 TODO 里那版更干净）**：该函数**本身就是 async** ✓ →
**在开头 await 一次**把 `character.assets` 全部 `urlToDataUrl` 成 data-URL 映射（已是 data: 的跳过），
再把映射传给**保持 sync 的** `messageTextHtml` ✓✓ —— 异步**不外溢**，sync 边界不动 ✓。

- 落点：`chatTranscript.ts:17`（签名）+ `:18`（text 分支）+ 调用处；`epub.ts:25` 同理
- 成本：小-中 · 风险：低（导出是纯读路径 ✓）
- 遗留：按**发言者**解析需要 `participantCharacters`（当前签名只有主 `character`）→ 建议**先按主角色**，
  与 VNStage 第一版一致，多角色场景单独立项 ✓

## 推荐第 3 刀：Do / Say / Narrate 输入模式（要先定语义）

- **语义决策（我建议）**：不做"模式机"（那是 AI Dungeon 的系统性改造 ✗）。做**轻前缀提示**：
  Composer 上一个 chip，选中后给本回合加一行**软提示**（"叙述这句，不要写角色台词"之类），
  **不改变消息存储、不改 prompt 结构**，只在 `renderTurn` 的 user 块末尾追加一行 ✓
- 落点：`components/chat/Composer.tsx`（chip）+ `lib/prompt/builder.ts` 的 `renderTurn`
- 成本：中 · 风险：中（碰 prompt ⇒ 必须跑全量快照测试 ✓）
- 验收：快照测试（不加 chip 时**逐字节不变** ✓ —— 与本仓"注入空注册表输出必须与基线一致"同一纪律 ✓）

## 推荐第 4 刀：场景模板填空（要先定 schema）

Mad-libs 式开场：`starterTemplates` 已有 ✓（世界模板画廊 + `relationshipStarters` 已在用 ✓）。
需要定的只有**填空项的 schema**（几个槽、每个槽的提示语、填完怎么写进开场）。
- 成本：中 · **风险：低**（纯新建聊天时的替换 ✓ 不影响既有聊天）
- 建议：**先只做"开场"**，不做"整条路线模板" ✓

## 推荐第 5 刀：用户脚本 / Output hook（边界未定，建议最后做）

本仓已有**插件 API**（`lib/plugins`）✓ 且其纪律是**拒绝式**（未声明能力就拒注册 ✓、未授权 transform 不被调用 ✓）。
用户脚本是它的**不可信版本** ✗：插件是"你信任的扩展"，用户脚本是"任意人写的代码" ✗。
- **我建议的边界（若要立项）**：先**只做正则脚本已有能力的形式化**（`applyRegexScripts` 已是无状态特例 ✓），
  **不引入任意 JS 执行**；真要执行必须 Web Worker + 无 fetch/DOM + 显式能力声明 ✓
- 成本：高 · 风险：高 · **我的建议：暂不做**，先把 1/2 刀的闭环和 3/4 刀补齐 ✓

---

## 一句话结论

**按 1 → 2 → 3 → 4 走，5 暂缓**。第 1 刀的理由最硬：它把"接线完整但无人能用"变成**真的可用** ✓。
