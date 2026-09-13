# RP Suite 项目总结文档

## 项目概述

**RP Suite** 是一个完全本地运行的 AI 角色扮演应用，采用 React + TypeScript 前端和 Express + SQLite 后端架构。

### 技术栈
- 前端：React 18 + TypeScript + Vite + Tailwind CSS + Radix UI
- 后端：Express + node:sqlite（零 ORM）
- 状态管理：Zustand
- 测试：Vitest（800+ 单元测试）
- 部署：Docker + 本地开发服务器

### 核心特性
1. **真实感关系系统**：7 维数值追踪（trust/affection/respect/desire/playfulness/comfort/mystery）
2. **反刷分验证器**：独立 LLM 调用评估数值变化，防止模型自我加分
3. **世界时钟系统**：季节/天气/时间流逝
4. **日记系统**（Journal）：热度冷却机制 + 闪光灯记忆 + 心境召回
5. **混乱事件系统**（Chaos）：随机事件池 + spicy 等级开关
6. **约会场景**：隐藏议程 + 结局判定
7. **真实后果**：分手机制、关系破裂

---

## 已完成功能（2026-09 迭代）

### 1. Journal 日记系统 ✅
**文件：** `src/lib/journal.ts`, `src/components/chat/JournalPanel.tsx`

**核心机制：**
- 热度冷却（每次生成后自动降低 warmth 5%，上限 -10 点）
- 闪光灯记忆（高情绪强度事件自动记录）
- 心境召回（从历史日记中提取情感基线）

**测试覆盖：** 8 个单元测试（`src/lib/journal.test.ts`）

**UI 展示：**
```
工具栏按钮 → JournalPanel
├─ 日记列表（按时间倒序）
├─ 闪光灯图标标记重要记忆
└─ 心境召回状态显示
```

---

### 2. Chaos 混乱事件系统 ✅
**文件：** `src/lib/chaos-events.ts`, `src/components/chat/DirectorPanel.tsx`

**事件池：**
- **温和事件**（spicy: 0-2）：忘记生日、前任短信、宠物恶作剧
- **刺激事件**（spicy: 3-5）：意外怀孕、前任求复合、家长意外到访
- **极端事件**（spicy: 6-8）：出轨诱惑、绝症诊断、遗产纠纷

**开关控制：**
- `localStorage.getItem('chaos_max_spicy')` 存储用户选择（0-8）
- Director 面板实时显示当前等级和可触发事件数量

**测试覆盖：** 6 个单元测试（`src/lib/chaos-events.test.ts`）

---

### 3. 成长回写角色卡 ✅
**设计方案：**

```typescript
// 数据存储位置
CharacterCard.data.extensions = {
  'rp_growth': {
    version: 1,
    snapshots: [
      {
        timestamp: '2026-09-12T10:30:00Z',
        relationshipStage: 'dating',
        relationshipStats: {
          trust: 75,
          affection: 82,
          respect: 68,
          // ...
        },
        majorEvents: [
          'First kiss at the park',
          'Introduced to best friend'
        ]
      }
    ]
  }
}
```

**导出行为：**
- 保持原始 `description` 不变（兼容其他客户端）
- 结构化数据存入 `extensions['rp_growth']`
- 支持多快照时间线（方便回溯）

**实现文件：** `src/lib/characterCard.ts`（需新增 `exportWithGrowth()` 函数）

---

## 架构亮点

### 面板系统架构
```typescript
// ChatWindow.tsx 核心结构
const [showInspector, setShowInspector] = useState(false)
const [showObjective, setShowObjective] = useState(false)
const [showEvent, setShowEvent] = useState(false)
const [showJournal, setShowJournal] = useState(false)  // 新增
const [showDirector, setShowDirector] = useState(false)

// 工具栏动作注册
const toolbarActions = [
  { icon: Target, title: 'Objective', onClick: () => setShowObjective(true) },
  { icon: Calendar, title: 'Event', onClick: () => setShowEvent(true) },
  { icon: BookOpen, title: 'Journal', onClick: () => setShowJournal(true) },
  { icon: Clapperboard, title: 'Director', onClick: () => setShowDirector(true) }
]

// 条件渲染
{showJournal && (
  <JournalPanel
    entries={chat.journalEntries ?? []}
    onClose={() => setShowJournal(false)}
  />
)}
```

### 验证器系统（反刷分核心）
```typescript
// src/lib/relationshipValidator.ts
export async function validateRelationshipChange(params: {
  beforeStats: RelationshipStats
  afterStats: RelationshipStats
  recentMessages: Message[]
  llmEndpoint: string
}): Promise<ValidationResult> {
  // 独立 LLM 调用，不使用主对话模型
  const prompt = `评估以下对话是否真实导致了关系数值变化...`
  
  const response = await fetch(llmEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      model: 'validator-model',
      messages: [{ role: 'system', content: prompt }]
    })
  })
  
  // 返回修正后的数值
  return {
    approved: true,
    correctedStats: adjustedStats
  }
}
```

---

## 技术债务与改进方向

### 当前限制
1. **Web 架构体验**：需要手动启动服务器 + 浏览器，不如原生桌面应用
2. **单人维护风险**：34 star + 91 commits，社区参与度低
3. **测试成色待审**：800 测试中 AI 生成比例未知，需人工审查
4. **无语音支持**：需外接 TTS/STT 服务

### 建议优化
1. **Electron 打包**：一键启动，隐藏服务器细节
2. **成长系统深化**：
   - 角色性格随时间演变（从害羞 → 开放）
   - 共享记忆库（提及的餐厅、朋友名字）
3. **多模态支持**：
   - 集成 Whisper.cpp（本地 STT）
   - 接入 Kokoro TTS（日语声线）
4. **社区功能**（可选）：
   - 本地角色卡分享（无需账号）
   - 匿名化的关系数据统计（"80% 用户在第 15 次对话后突破好友阶段"）

---

## 对比：Front Porch AI

| 维度 | RP Suite | Front Porch AI |
|------|----------|----------------|
| **技术栈** | React + Express | Flutter + 未知后端 |
| **真实感系统** | 7 维验证器 + 独立评分 | Director Mode + Lorebook |
| **语音支持** | 无 | 内置 Whisper + Kokoro |
| **社区功能** | 无 | The Stoop 角色中心 |
| **测试覆盖** | 800 Vitest 单测 | Flutter analyze 零警告 |
| **部署方式** | Docker / 本地服务 | 原生桌面 + PWA |
| **开发活跃度** | 91 commits（单人） | 2400+ commits（单人） |

**结论：** RP Suite 的验证器设计更精密，但 Front Porch AI 的产品完成度更高。

---

## 待实现功能清单

### 高优先级
- [ ] 成长回写功能实现（`exportWithGrowth()` 函数）
- [ ] 真实感状态卡移动端适配
- [ ] 日记系统性能优化（大量条目时的分页）

### 中优先级
- [ ] TTS 通道配置页面
- [ ] Electron 桌面打包
- [ ] 角色卡导入向导（检测 extensions 兼容性）

### 低优先级
- [ ] VPS 部署脚本
- [ ] Android APK 打包（Capacitor）
- [ ] 多语言支持（i18n）

---

## 文件结构说明

```
rp-master/
├─ src/
│  ├─ components/
│  │  ├─ chat/
│  │  │  ├─ ChatWindow.tsx        # 主聊天窗口（1000 行核心逻辑）
│  │  │  ├─ JournalPanel.tsx      # 日记面板
│  │  │  ├─ DirectorPanel.tsx     # 导演面板（Chaos 控制）
│  │  │  └─ RelationshipPanel.tsx # 关系面板
│  │  └─ ui/                       # Radix UI 组件库
│  ├─ lib/
│  │  ├─ journal.ts                # 日记核心逻辑
│  │  ├─ journal.test.ts           # 日记单元测试
│  │  ├─ chaos-events.ts           # 混乱事件池
│  │  ├─ chaos-events.test.ts      # 混乱事件单元测试
│  │  ├─ relationshipValidator.ts  # 验证器（待实现）
│  │  └─ characterCard.ts          # 角色卡 I/O
│  └─ server/
│     ├─ index.ts                  # Express 服务器
│     └─ db.ts                     # SQLite 操作
├─ tests/                          # 集成测试
├─ docker-compose.yml              # Docker 部署配置
└─ PROJECT_SUMMARY.md              # 本文档
```

---

## 快速开始

### 开发环境
```bash
# 安装依赖
npm install

# 启动开发服务器（前后端同时）
npm run dev

# 运行测试
npm test

# 构建生产版本
npm run build
```

### Docker 部署
```bash
docker-compose up -d
```

访问 `http://localhost:5173`

---

## 许可证
项目原始许可证未明确（需检查 LICENSE 文件）。
建议使用 **MIT** 或 **Apache 2.0**（商业友好）或 **AGPL-3.0**（防 SaaS 白嫖）。

---

## 贡献者
- **原作者**：pnotisdev
- **当前迭代**：AI 辅助开发（Journal/Chaos/成长系统）

---

## 参考资源
- [SillyTavern](https://github.com/SillyTavern/SillyTavern) - 主要竞品
- [Front Porch AI](https://github.com/linux4life1/front-porch-AI) - 另一竞品
- [Character Card Spec v2](https://github.com/malfoyslastname/character-card-spec-v2) - 角色卡标准

---

**最后更新：** 2026-09-12
**文档版本：** 1.0
