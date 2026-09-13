# RP Suite 开发计划

## 当前状态（2026-09-12）

### ✅ 已完成功能
1. **Journal 日记系统**
   - 热度冷却机制（每次生成 -5% warmth，上限 -10）
   - 闪光灯记忆（高情绪强度自动标记）
   - 心境召回（从历史提取情感基线）
   - 8 个单元测试全部通过
   - UI 面板完整集成到工具栏

2. **Chaos 混乱事件系统**
   - 24 个事件分 3 档（温和/刺激/极端）
   - spicy 等级开关（0-8 可调）
   - localStorage 持久化用户偏好
   - Director 面板实时显示可用事件
   - 6 个单元测试全部通过

3. **成长回写角色卡方案**
   - 技术方案已确定：使用 `CharacterCard.data.extensions['rp_growth']`
   - 数据结构设计完成（快照 + 时间线）
   - 向后兼容（不破坏原始 description）

---

## 🚧 待实现功能

### Phase 1: 核心功能补全（预计 1-2 周）

#### 1.1 成长回写功能实现
**优先级：** 🔴 高

**任务清单：**
- [ ] 在 `src/lib/characterCard.ts` 中实现 `exportWithGrowth()` 函数
- [ ] 添加快照生成逻辑（触发时机：warmth 变化 ±15、关系阶段变化、重大事件）
- [ ] 实现多快照管理（保留最近 10 个快照，超出自动归档）
- [ ] 添加导出 UI 选项（"导出时包含成长数据"复选框）
- [ ] 编写 5 个单元测试：
  ```typescript
  describe('exportWithGrowth', () => {
    it('should preserve original description')
    it('should add growth extension without breaking V2 spec')
    it('should handle multiple snapshots correctly')
    it('should validate snapshot timestamps')
    it('should handle cards without growth data gracefully')
  })
  ```

**实现参考：**
```typescript
// src/lib/characterCard.ts
export interface GrowthSnapshot {
  timestamp: string // ISO 8601
  relationshipStage: string
  relationshipStats: RelationshipStats
  majorEvents: string[] // 最近 5 个重大事件
  messageCount: number
  daysElapsed: number
}

export function exportWithGrowth(
  card: CharacterCard,
  chat: Chat
): CharacterCard {
  const snapshot: GrowthSnapshot = {
    timestamp: new Date().toISOString(),
    relationshipStage: chat.relationshipStage ?? 'stranger',
    relationshipStats: chat.relationshipStats ?? DEFAULT_STATS,
    majorEvents: extractMajorEvents(chat.messages, 5),
    messageCount: chat.messages.length,
    daysElapsed: calculateDaysElapsed(chat.world)
  }

  const existing = card.data.extensions?.['rp_growth']?.snapshots ?? []
  const updated = [...existing, snapshot].slice(-10) // 保留最近 10 个

  return {
    ...card,
    data: {
      ...card.data,
      extensions: {
        ...card.data.extensions,
        'rp_growth': {
          version: 1,
          snapshots: updated
        }
      }
    }
  }
}
```

**验收标准：**
- 导出的角色卡可被 SillyTavern 正常识别（忽略未知 extension）
- 成长数据可在重新导入时正确读取
- 原始 `description` 字段保持不变

---

#### 1.2 真实感状态卡移动端适配
**优先级：** 🔴 高

**问题描述：**
当前 `RelationshipPanel.tsx` 在手机屏幕上显示不全（7 个数值条横向溢出）

**解决方案：**
```typescript
// src/components/chat/RelationshipPanel.tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
  {/* 手机单列，平板双列，桌面单列（侧边栏） */}
  <StatBar label="Trust" value={stats.trust} />
  <StatBar label="Affection" value={stats.affection} />
  {/* ... */}
</div>
```

**任务清单：**
- [ ] 添加响应式断点（Tailwind `sm:` / `md:` / `lg:`）
- [ ] 测试 3 种屏幕尺寸：375px（手机）/ 768px（平板）/ 1024px（桌面）
- [ ] 优化触摸热区（按钮最小 44x44px）
- [ ] 测试 iOS Safari / Android Chrome

---

#### 1.3 日记系统性能优化
**优先级：** 🟡 中

**问题描述：**
当日记条目超过 100 条时，`JournalPanel` 渲染变慢

**解决方案：**
```typescript
// src/components/chat/JournalPanel.tsx
import { useVirtualizer } from '@tanstack/react-virtual'

export function JournalPanel({ entries }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // 每条日记约 80px 高
    overscan: 5
  })

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => (
          <JournalEntry
            key={item.key}
            entry={entries[item.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

**任务清单：**
- [ ] 安装 `@tanstack/react-virtual`
- [ ] 实现虚拟滚动
- [ ] 基准测试：1000 条日记的渲染性能
- [ ] 添加"加载更多"分页（初次只显示最近 50 条）

---

### Phase 2: 用户体验增强（预计 2-3 周）

#### 2.1 TTS 通道配置页面
**优先级：** 🟡 中

**需求：**
- 支持多种 TTS 后端（OpenAI TTS / ElevenLabs / 本地 Coqui）
- 实时试听（"试听此声音"按钮）
- 语速/音调调节
- 自动朗读开关（生成后自动播放角色消息）

**技术方案：**
```typescript
// src/lib/tts.ts
export interface TTSConfig {
  backend: 'openai' | 'elevenlabs' | 'coqui'
  apiKey?: string
  voiceId: string
  speed: number // 0.5 - 2.0
  pitch: number // -10 - 10
  autoPlay: boolean
}

export async function speak(text: string, config: TTSConfig): Promise<void> {
  const audio = await generateSpeech(text, config)
  const audioElement = new Audio(audio.url)
  audioElement.play()
}
```

**UI 位置：**
Settings → Voice → TTS Settings

---

#### 2.2 Electron 桌面打包
**优先级：** 🟡 中

**目标：**
- 一键启动（隐藏服务器细节）
- 系统托盘常驻
- 开机自启动选项
- 自动更新（可选）

**技术方案：**
```bash
npm install --save-dev electron electron-builder
```

```javascript
// electron/main.js
const { app, BrowserWindow, Tray } = require('electron')
const express = require('express')
const path = require('path')

let server
let mainWindow

app.on('ready', () => {
  // 启动 Express 服务器
  server = require('../server/index.js')
  
  // 创建窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  
  mainWindow.loadURL('http://localhost:3000')
})
```

**任务清单：**
- [ ] 配置 Electron 主进程
- [ ] 打包 Windows / macOS / Linux 版本
- [ ] 添加应用图标
- [ ] 配置自动更新（electron-updater）

---

#### 2.3 角色卡导入向导
**优先级：** 🟢 低

**需求：**
- 检测角色卡格式（V1 / V2 / V3）
- 检测 extensions 兼容性
- 显示成长数据预览（如果存在）
- 一键迁移旧版数据

**UI 流程：**
```
1. 上传角色卡 PNG
   ↓
2. 自动解析 metadata
   ↓
3. 显示兼容性报告
   - ✅ 基础信息（name / description）
   - ✅ 成长数据（3 个快照）
   - ⚠️  未知扩展（rp_custom_field）
   ↓
4. 确认导入
```

---

### Phase 3: 高级功能（预计 4-6 周）

#### 3.1 角色性格演变系统
**优先级：** 🟢 低

**设计思路：**
```typescript
interface PersonalityTrait {
  name: string // 'shyness' / 'openness' / 'dominance'
  value: number // 0-100
  history: { timestamp: string; value: number }[]
}

// 随着 messageCount 增加，性格逐渐稳定
const shynessDecay = Math.max(
  initialShyness - (messageCount / 100) * 10,
  20 // 最低保留 20% 基础害羞
)
```

**触发条件：**
- 每 50 条消息重新评估一次性格
- 重大事件（first_time / commitment）立即触发

---

#### 3.2 共享记忆库
**优先级：** 🟢 低

**功能：**
- 自动提取命名实体（人名/地名/餐厅）
- 构建关系图谱（"Alice 是主角的室友"）
- 记忆一致性检查（"上次你说喜欢意大利菜，这次怎么说讨厌？"）

**技术方案：**
使用 LLM 的 function calling 提取结构化信息：
```typescript
{
  "function": "add_memory",
  "arguments": {
    "type": "person",
    "name": "Alice",
    "relationship": "roommate",
    "firstMentioned": "2026-09-12"
  }
}
```

---

#### 3.3 多模态支持
**优先级：** 🟢 低

**STT（语音输入）：**
- 集成 Whisper.cpp（本地推理）
- 支持实时流式识别
- 多语言支持（英/中/日）

**图像理解：**
- 支持发送图片（"看看我今天的穿搭"）
- 使用 GPT-4V / Claude 3 分析
- 生成相关回复

---

### Phase 4: 部署与分发（预计 1-2 周）

#### 4.1 VPS 部署脚本
**优先级：** 🟢 低

```bash
# deploy.sh
#!/bin/bash
docker-compose -f docker-compose.prod.yml up -d
nginx -t && systemctl reload nginx
```

**配置 HTTPS：**
```nginx
server {
  listen 443 ssl;
  server_name rp.example.com;
  
  ssl_certificate /etc/letsencrypt/live/rp.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/rp.example.com/privkey.pem;
  
  location / {
    proxy_pass http://localhost:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
  }
}
```

---

#### 4.2 Android APK 打包
**优先级：** 🟢 低

**技术方案：** Capacitor（React → Native）

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android

npx cap init
npx cap add android
npx cap sync
npx cap open android
```

**注意事项：**
- 后端服务器仍需运行在本地/远程
- 需要处理 Android 权限（网络/存储）
- APK 体积优化（去除开发依赖）

---

## 🎯 里程碑

### v0.9.0（当前版本）
- ✅ Journal 系统上线
- ✅ Chaos 系统上线
- ✅ 成长回写方案设计完成

### v1.0.0（目标：2026-10-15）
- 成长回写功能实现
- 移动端适配完成
- 日记性能优化
- TTS 通道配置
- Electron 桌面版发布

### v1.1.0（目标：2026-11-30）
- 角色性格演变
- 共享记忆库
- 多模态支持（STT/图像）

### v1.2.0（目标：2026-12-31）
- VPS 部署文档
- Android APK 发布
- 多语言 i18n

---

## 📊 技术债务清单

### 高优先级
1. **测试覆盖率审查**
   - 800 测试中 AI 生成比例未知
   - 需人工审查关键路径测试（关系验证器/日记冷却）

2. **类型安全**
   - 部分 `any` 类型需替换为严格类型
   - 添加 `strict: true` 到 tsconfig.json

3. **错误处理**
   - LLM 调用失败时的降级策略
   - SQLite 写入失败的事务回滚

### 中优先级
4. **性能优化**
   - MessageLog 虚拟滚动（超过 500 条消息时）
   - 图片懒加载（角色头像）

5. **可访问性**
   - 键盘导航支持（Tab / Shift+Tab）
   - 屏幕阅读器 ARIA 标签

### 低优先级
6. **代码组织**
   - 拆分 ChatWindow.tsx（1000 行过长）
   - 提取公共 hooks（useRelationshipStats / useJournal）

---

## 🛠️ 开发规范

### Git 提交格式
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构
- `test`: 测试
- `docs`: 文档

**示例:**
```
feat(journal): add flashbulb memory detection

- Implement intensity scoring based on emotional keywords
- Auto-tag entries with intensity > 7
- Add visual indicator (⚡) in JournalPanel

Closes #42
```

### 代码审查清单
- [ ] 类型安全（无 `any` 滥用）
- [ ] 测试覆盖（新功能 ≥ 80%）
- [ ] 无 ESLint 警告
- [ ] 性能测试（大数据集）
- [ ] 移动端测试（真机）

---

## 📚 参考资源

### 竞品分析
- [SillyTavern](https://github.com/SillyTavern/SillyTavern) - 功能最全的 RP 客户端
- [Front Porch AI](https://github.com/linux4life1/front-porch-AI) - Flutter 跨平台方案
- [Backyard AI](https://backyard.ai/) - 已关停，参考其设计理念

### 技术文档
- [Character Card Spec v2](https://github.com/malfoyslastname/character-card-spec-v2)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Zustand State Management](https://zustand-demo.pmnd.rs/)

### AI 模型推荐
- **主对话模型：** Claude 3.5 Sonnet / GPT-4 Turbo
- **验证器模型：** GPT-4o-mini（便宜且够用）
- **本地模型：** Llama 3.1 70B（通过 KoboldCpp）

---

## 🤝 贡献指南

欢迎 PR！请遵循以下流程：

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feat/amazing-feature`)
3. 提交代码 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 开启 Pull Request

**优先接受的 PR 类型：**
- Bug 修复
- 性能优化
- 测试补充
- 文档改进

**暂不接受的 PR 类型：**
- 大规模架构重构（需先开 Issue 讨论）
- 未经讨论的新功能

---

**文档维护者：** AI 辅助开发团队  
**最后更新：** 2026-09-12  
**计划版本：** v2.0
