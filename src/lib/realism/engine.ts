/**
 * Realism Engine absorption (Front Porch mechanisms, reimplemented from its design docs).
 *
 * Pure state + physics + guidance: no I/O, no LLM calls. The judge call (relationshipAssist.ts)
 * proposes; the functions here dispose — FP's own "LLM proposes, code disposes" policy. All state
 * rides on the existing per-character `RelationshipTrack.realism` field, persisted with the chat.
 *
 * v1 scope: promise ledger, trust repair window, two-speed bond, mood intensity, fixations,
 * seven-need simulation, growth rings, chaos mode, recap. Dreams and auto time passage deferred.
 */

import type { RelationshipDimension } from '@/lib/types'

// --- types -------------------------------------------------------------------

export interface OpenPromise {
  id: string
  text: string
  by: 'user' | 'char'
  status: 'open' | 'kept' | 'broken'
  createdAtReply: number
  resolvedReply?: number
}

export interface GrowthRing {
  id: string
  text: string
  tier: 'emerging' | 'developing' | 'established'
  /** 0-3: emerging starts at 1; established is permanent. Unpinned rings fade 0.5/check. */
  strength: number
  pinned?: boolean
  createdAtReply: number
}

export interface RealismState {
  promises?: OpenPromise[]
  /** Slow, sticky bond layer (0-100) that only sustained patterns move. */
  bondLongTerm?: number
  /** Armed when a single turn costs ≥20 trust; the next judged turn decides the repair. */
  repair?: { loss: number } | null
  moodIntensity?: 'mild' | 'moderate' | 'strong'
  /** A thought that won't let go — colors replies until `untilReply`, then fades. */
  fixation?: { text: string; untilReply: number } | null
  rings?: GrowthRing[]
  needs?: Partial<NeedsState>
  chaosPressure?: number
  /** The chaos event currently in play — injected into the next reply, then cleared. */
  pendingEvent?: string | null
  /** The character's own diary (FP Journal absorption): heat-cooled memory entries. */
  journal?: JournalEntry[]
}

export const NEED_KEYS = ['hunger', 'bladder', 'energy', 'social', 'fun', 'hygiene', 'comfort'] as const
export type NeedKey = (typeof NEED_KEYS)[number]
export type NeedsState = Record<NeedKey, number>

export const NEED_LABELS_ZH: Record<NeedKey, string> = {
  hunger: '饱腹',
  bladder: '如厕',
  energy: '精力',
  social: '社交',
  fun: '娱乐',
  hygiene: '清洁',
  comfort: '舒适',
}

/** Per-turn passive decay — FP's "every turn drains each need a little". */
const NEED_DECAY: Record<NeedKey, number> = {
  hunger: 1.5,
  bladder: 2,
  energy: 1.2,
  social: 0.8,
  fun: 1,
  hygiene: 0.6,
  comfort: 0.7,
}

const PROMISE_KEEP_TRUST = 12
const PROMISE_KEEP_AFFECTION = 6
const PROMISE_BREAK_TRUST = -22
const PROMISE_BREAK_AFFECTION = -10
export const REPAIR_ARM_THRESHOLD = 20
const RING_CAP = 12
export const RING_CHECK_EVERY = 5

// --- needs -------------------------------------------------------------------

export function decayNeeds(needs: Partial<NeedsState> | undefined): NeedsState {
  const out = {} as NeedsState
  for (const k of NEED_KEYS) {
    const v = needs?.[k] ?? 85
    out[k] = Math.max(0, Math.min(100, Math.round((v - NEED_DECAY[k]) * 10) / 10))
  }
  return out
}

export function applyNeedsDelta(needs: Partial<NeedsState> | undefined, delta: Partial<Record<NeedKey, number>>): NeedsState {
  const out = decayNeeds(needs)
  for (const k of NEED_KEYS) {
    const d = delta?.[k]
    if (typeof d === 'number' && Number.isFinite(d)) out[k] = Math.max(0, Math.min(100, Math.round((out[k] + d) * 10) / 10))
  }
  return out
}

/** Model-facing line, only when a need would actually color the reply. */
export function needsGuidance(needs: Partial<NeedsState> | undefined): string {
  if (!needs) return ''
  const parts: string[] = []
  for (const k of NEED_KEYS) {
    const v = needs[k]
    if (v === undefined) continue
    if (v < 20) parts.push(`${NEED_LABELS_ZH[k]}已到极限（${Math.round(v)}）——{{char}}会忍不住直接行动，比如去吃东西、去洗手间、去睡`)
    else if (v < 35) parts.push(`${NEED_LABELS_ZH[k]}偏低（${Math.round(v)}）——会不自觉影响她的语气和注意力`)
  }
  return parts.length ? `生理状态（隐含在表演里，绝不报数字）：${parts.join('；')}。` : ''
}

// --- promises ----------------------------------------------------------------

export interface PromiseOps {
  opened?: { text: string; by: 'user' | 'char' }[]
  kept?: number[]
  broken?: number[]
}

export interface PromiseApplyResult {
  state: OpenPromise[]
  trustDelta: number
  affectionDelta: number
  summary: string
}

export function applyPromiseOps(
  promises: OpenPromise[] | undefined,
  ops: PromiseOps | undefined,
  replyIndex: number,
): PromiseApplyResult {
  const list = (promises ?? []).map((p) => ({ ...p }))
  let trustDelta = 0
  let affectionDelta = 0
  const notes: string[] = []
  const openList = list.filter((p) => p.status === 'open')
  for (const id of ops?.kept ?? []) {
    const p = openList[id]
    if (!p) continue
    p.status = 'kept'
    p.resolvedReply = replyIndex
    if (p.by === 'user') {
      trustDelta += PROMISE_KEEP_TRUST
      affectionDelta += PROMISE_KEEP_AFFECTION
      notes.push(`守约+`)
    } else {
      affectionDelta += PROMISE_KEEP_AFFECTION
      notes.push('她兑现了承诺')
    }
  }
  for (const id of ops?.broken ?? []) {
    const p = openList[id]
    if (!p) continue
    p.status = 'broken'
    p.resolvedReply = replyIndex
    if (p.by === 'user') {
      trustDelta += PROMISE_BREAK_TRUST
      affectionDelta += PROMISE_BREAK_AFFECTION
      notes.push('违诺−')
    } else {
      affectionDelta += PROMISE_BREAK_AFFECTION
      notes.push('她食言了')
    }
  }
  for (const o of ops?.opened ?? []) {
    if (list.filter((p) => p.status === 'open').length >= 3) break
    list.push({ id: `p${replyIndex}-${Math.random().toString(36).slice(2, 8)}`, text: o.text, by: o.by, status: 'open', createdAtReply: replyIndex })
  }
  return { state: list, trustDelta, affectionDelta, summary: notes.join(',') }
}

export function openRealismPromises(promises: OpenPromise[] | undefined): OpenPromise[] {
  return (promises ?? []).filter((p) => p.status === 'open')
}

export function promisesGuidance(promises: OpenPromise[] | undefined): string {
  const open = openRealismPromises(promises)
  if (!open.length) return ''
  const lines = open.map((p) => `- [${p.by === 'user' ? 'user' : 'char'}] ${p.text}`).join('\n')
  return `未兑现的承诺（守约与违诺都会被记住并产生真实后果）：\n${lines}`
}

// --- trust repair --------------------------------------------------------------

export interface RepairApplyResult {
  state: { loss: number } | null
  trustDelta: number
  note: string
}

/** Arms the window when one turn cost ≥20 trust. FP's "repair window". */
export function armRepairIfNeeded(state: RealismState | undefined, trustDeltaThisTurn: number): { loss: number } | null {
  if (trustDeltaThisTurn <= -REPAIR_ARM_THRESHOLD) return { loss: -trustDeltaThisTurn }
  return state?.repair ?? null
}

/** A sincere attempt wins back half the loss (min 8); a glib one earns nothing. */
export function applyRepair(state: RealismState | undefined, repairSincere: boolean | undefined): RepairApplyResult {
  const window = state?.repair
  if (!window) return { state: null, trustDelta: 0, note: '' }
  if (repairSincere) {
    const restore = Math.max(8, Math.round(window.loss / 2))
    return { state: null, trustDelta: restore, note: `修复窗口：真诚道歉，信任+${restore}` }
  }
  return { state: window, trustDelta: 0, note: '' }
}

export function repairGuidance(state: RealismState | undefined): string {
  if (!state?.repair) return ''
  return `信任修复窗口已开启：上一轮${state.repair.loss}点信任损失仍横在两人之间。{{user}}这次的发言会被认真审视——真诚、符合她性格的弥补能修复一部分；敷衍的道歉只会让情况更糟。`
}

// --- two-speed bond -------------------------------------------------------------

/** Long-term bond creeps at ~1/8 the speed of short-term warmth, same 0-100 scale. */
export function nextBondLongTerm(current: number | undefined, warmthDelta: number): number {
  const v = (current ?? 50) + warmthDelta * 0.125
  return Math.max(0, Math.min(100, Math.round(v * 100) / 100))
}

/** FP's drift-to-neutral: every 10 char replies, affection eases 1 point toward the middle (50). */
export function bondDrift(affection: number, replyIndex: number): number {
  if (replyIndex === 0 || replyIndex % 10 !== 0) return affection
  const drift = affection > 50 ? -1 : affection < 50 ? 1 : 0
  return affection + drift
}

// --- fixations -------------------------------------------------------------------

export function fixationGuidance(state: RealismState | undefined, replyIndex: number): string {
  const fx = state?.fixation
  if (!fx || replyIndex > fx.untilReply) return ''
  return `心结（不抢戏，只若隐若现）：${fx.text} 它可能以一个小动作、一次走神或话题被轻轻带回来的方式出现。`
}

// --- growth rings -------------------------------------------------------------------

export interface RingProposal {
  action: 'add' | 'reinforce'
  index?: number
  text?: string
}

export function mergeRings(
  rings: GrowthRing[] | undefined,
  proposals: RingProposal[] | undefined,
  replyIndex: number,
): { rings: GrowthRing[]; changed: boolean; added: string[] } {
  const list = (rings ?? []).map((r) => ({ ...r }))
  const added: string[] = []
  const touched = new Set<string>()
  for (const p of proposals ?? []) {
    if (p.action === 'add' && p.text?.trim()) {
      if (list.length < RING_CAP) {
        const id = `r${replyIndex}-${Math.random().toString(36).slice(2, 8)}`
        list.push({ id, text: p.text.trim(), tier: 'emerging', strength: 1, createdAtReply: replyIndex })
        touched.add(id)
        added.push(p.text.trim())
      }
    } else if (p.action === 'reinforce' && typeof p.index === 'number' && list[p.index]) {
      const r = list[p.index]
      r.strength = Math.min(3, r.strength + 1)
      r.tier = r.strength >= 3 ? 'established' : r.strength >= 2 ? 'developing' : 'emerging'
      touched.add(r.id)
    }
  }
  // Unpinned, non-established rings fade 0.5/check; zero strength retires.
  const faded = list.filter((r) => !r.pinned && r.tier !== 'established' && !touched.has(r.id))
  for (const r of faded) r.strength = Math.max(0, r.strength - 0.5)
  const kept = list.filter((r) => r.strength > 0)
  // Cap trim: drop the weakest unpinned non-established ring when over cap.
  const over = kept.length - RING_CAP
  if (over > 0) {
    const droppable = kept
      .filter((r) => !r.pinned && r.tier !== 'established')
      .sort((a, b) => a.strength - b.strength)
      .slice(0, over)
    for (const d of droppable) kept.splice(kept.indexOf(d), 1)
  }
  const changed = JSON.stringify(kept) !== JSON.stringify(rings ?? []) || added.length > 0
  return { rings: kept, changed, added }
}

export function ringsGuidance(rings: GrowthRing[] | undefined): string {
  const active = (rings ?? []).filter((r) => r.tier !== 'emerging' || r.strength >= 1)
  if (!active.length) return ''
  const tierName = { emerging: '初萌', developing: '渐成', established: '已定型' } as const
  return `这段时间在她身上留下的改变（自然体现，不要自我陈述）：\n${active.map((r) => `- [${tierName[r.tier]}] ${r.text}`).join('\n')}`
}

// --- chaos mode -------------------------------------------------------------------

export type ChaosFlavor = 'fortune' | 'misfortune' | 'chaos' | 'wild' | 'slapstick'

export interface ChaosEvent {
  text: string
  flavor: ChaosFlavor
  /** 仅在开启 spicy 开关（localStorage rp.chaosSpicy）后进入抽取池。 */
  spicy?: boolean
}

/** 命运轮盘事件池：🟢 幸运 🔴 厄运 💛 混乱 💜 离谱 🎪 滑稽（🌶️ = spicy 开关解锁）。 */
export const CHAOS_EVENTS: ChaosEvent[] = [
  // 🟢 幸运
  { text: '一个陌生人突然替{{char}}买了单，微笑着离开，怎么追都追不上。', flavor: 'fortune' },
  { text: '{{char}}弯腰时捡到一张崭新的纸币，正好是两人两份甜品的钱。', flavor: 'fortune' },
  { text: '店里搞活动，{{char}}点的东西正好是今天的免费赠品。', flavor: 'fortune' },
  { text: '久未联系的老朋友路过，热情地打了招呼还塞给{{char}}两张演出票。', flavor: 'fortune' },
  { text: '自动贩卖机多吐出来一罐饮料，不偏不倚落在{{char}}脚边。', flavor: 'fortune' },
  { text: '{{char}}抽签抽到了上上签，签文好得让她都不好意思念出来。', flavor: 'fortune' },
  { text: '书店老板认出{{char}}是常客，送了她一本一直想要的绝版书。', flavor: 'fortune' },
  { text: '天边突然放晴，一整道彩虹横在两人面前。', flavor: 'fortune' },
  { text: '公交车正好在两人到站的瞬间进站，司机示意慢点不着急。', flavor: 'fortune' },
  { text: '{{char}}发现那家一直排队的老店今天居然没人排队。', flavor: 'fortune' },
  { text: '门口的流浪猫主动蹭上{{char}}的裤腿，跟着走了一路。', flavor: 'fortune' },
  { text: '{{char}}随手买的刮刮乐刮出了一个小奖，小钱但高兴。', flavor: 'fortune' },
  // 🔴 厄运
  { text: '{{char}}的鞋跟断了，走路一瘸一拐，脸上挂不住。', flavor: 'misfortune' },
  { text: '一杯饮料整个泼在{{char}}的包上，里面的书湿了一角。', flavor: 'misfortune' },
  { text: '突然暴雨，两人躲雨的屋檐还漏水，正滴在{{char}}头上。', flavor: 'misfortune' },
  { text: '{{char}}的手机摔在地上，屏幕裂出一道蜘蛛网。', flavor: 'misfortune' },
  { text: '{{char}}踩到水坑，溅了一腿泥，正好是在穿新鞋的日子。', flavor: 'misfortune' },
  { text: '钥匙断在{{char}}家的锁孔里，进不了门。', flavor: 'misfortune' },
  { text: '{{char}}发现自己背包的拉链开了，东西丢了几样。', flavor: 'misfortune' },
  { text: '公交车在两人眼前关门开走，下一班要等半小时。', flavor: 'misfortune' },
  { text: '{{char}}的钱包忘在家里了，偏偏这顿要她付。', flavor: 'misfortune' },
  { text: '一阵妖风把{{char}}刚做好的发型吹得乱七八糟。', flavor: 'misfortune' },
  { text: '{{char}}的丝袜勾破了，抽丝抽到了膝盖。', flavor: 'misfortune' },
  { text: '排队排到{{char}}时，那家店贴出了"售罄"的牌子。', flavor: 'misfortune' },
  // 💛 混乱
  { text: '邻桌的情侣吵起来了，越吵越大声，整个店的人都在看。', flavor: 'chaos' },
  { text: '停电了，整个空间陷入黑暗，只有手机屏幕亮着。', flavor: 'chaos' },
  { text: '火警警报突然响起，所有人被疏散到街上。', flavor: 'chaos' },
  { text: '一场突如其来的堵车把两人困在原地整整一小时。', flavor: 'chaos' },
  { text: '店里突然涌进来一整个旅行团，喧闹不堪。', flavor: 'chaos' },
  { text: '广播里点名找一个和{{user}}同姓的人。', flavor: 'chaos' },
  { text: '街道上开始拍电影，剧组把整条路都封锁了。', flavor: 'chaos' },
  { text: '有人举着相机在拍街头素材，镜头正好对着这边。', flavor: 'chaos' },
  { text: '一只鸽子飞进来，在两人头顶盘旋了一圈。', flavor: 'chaos' },
  { text: '店里的音响突然放起了{{char}}最尴尬的中学时代的歌。', flavor: 'chaos' },
  { text: '一群放学的中学生涌入，把安静的空间挤得水泄不通。', flavor: 'chaos' },
  { text: '外面传来救护车和消防车交替的鸣笛，久久不散。', flavor: 'chaos' },
  // 💜 离谱
  { text: '一个陌生人认错了人，热情地跟{{char}}打招呼，叫出一个陌生的名字。', flavor: 'wild' },
  { text: '一个小孩跑过来，大声问{{char}}是不是{{user}}的男朋友/女朋友。', flavor: 'wild' },
  { text: '{{char}}收到一条不知谁发的消息："计划有变，提前行动。"', flavor: 'wild' },
  { text: '{{char}}发现口袋里有一张不知什么时候塞进来的字条，字迹陌生。', flavor: 'wild' },
  { text: '路边摊的算命先生非要给两人算一卦，说得神乎其神。', flavor: 'wild' },
  { text: '{{char}}的旧同学突然出现，开口就提当年{{char}}的糗事。', flavor: 'wild' },
  { text: '一只戴着项圈会"说话"的鹦鹉落在窗外，重复着奇怪的词。', flavor: 'wild' },
  { text: '{{char}}的手机自动播放起她三年来最尴尬的一段语音。', flavor: 'wild' },
  { text: '门口贴出告示：此地下周将出现在某部电影的取景名单里。', flavor: 'wild' },
  { text: '有人把一大束气球系在了{{char}}的自行车上。', flavor: 'wild' },
  { text: '{{char}}点的外卖到了，但她根本没有点过外卖。', flavor: 'wild' },
  { text: '一个街头魔术师非要把{{char}}拉上去当搭档。', flavor: 'wild' },
  // 🎪 滑稽
  { text: '{{char}}打了个大大的哈欠，怎么也忍不住，眼睛都挤出了眼泪。', flavor: 'slapstick' },
  { text: '{{char}}的椅子忽然发出巨大的一声怪响，全店侧目。', flavor: 'slapstick' },
  { text: '{{char}}的饮料吸管怎么也插不进去，试了五次。', flavor: 'slapstick' },
  { text: '自动门在{{char}}面前关上了三次，她进退两难。', flavor: 'slapstick' },
  { text: '{{char}}的假发片/发夹掉了，滚到{{user}}脚边。', flavor: 'slapstick' },
  { text: '{{char}}一坐下，裤子传来轻微的撕扯声，她僵住了。', flavor: 'slapstick' },
  { text: '{{char}}对着玻璃门走了过去——那其实是一扇关着的门。', flavor: 'slapstick' },
  { text: '{{char}}的手机电量1%，她翻遍了包也没找到充电宝。', flavor: 'slapstick' },
  { text: '{{char}}想潇洒地把头发甩到耳后，结果拍到了自己的脸。', flavor: 'slapstick' },
  { text: '薯片袋炸开了，零食撒了一桌，两人默默捡了半天。', flavor: 'slapstick' },
  { text: '{{char}}的口罩挂在了耳朵上一只，她自己毫无察觉。', flavor: 'slapstick' },
  { text: '一张传单精准地糊在了{{char}}脸上，怎么撕都撕不干净。', flavor: 'slapstick' },
  // 🌶️ spicy（默认关闭）
  { text: '一阵风掀起了{{char}}的裙摆，她手忙脚乱地按住，耳根通红地瞪了{{user}}一眼。', flavor: 'chaos', spicy: true },
  { text: '{{char}}的衬衫扣子崩开了一颗，她浑然不觉地继续说话。', flavor: 'wild', spicy: true },
  { text: '隔壁卡座传来明显属于成人场合的动静，两人假装没听见，耳朵却红了。', flavor: 'chaos', spicy: true },
  { text: '{{char}}弯腰捡东西时，衣服领口走了光，是{{user}}先看到还是别人先看到，气氛微妙。', flavor: 'wild', spicy: true },
  { text: '售卖机的避孕套商品卡灯一闪一闪，正好对着两人的座位。', flavor: 'slapstick', spicy: true },
  { text: '{{char}}手机的相册突然弹出来一张不应该出现在这里的照片，她手忙脚乱地划掉。', flavor: 'wild', spicy: true },
  { text: '调皮的服务员在两人饮品里插了根心形吸管，还挤了挤眼睛。', flavor: 'slapstick', spicy: true },
  { text: '{{char}}输了游戏，惩罚是让{{user}}在她手心写一个词，猜错就要做一件事。', flavor: 'wild', spicy: true },
  { text: '休息室的沙发突然塌了一角，两人不得不挤在同一侧。', flavor: 'chaos', spicy: true },
  { text: '{{char}}的外套忘在了{{user}}家，里面还有她的换洗衣物。', flavor: 'wild', spicy: true },
]

/** Whether the 🌶️ spicy events are unlocked (localStorage toggle; default off). */
export function chaosSpicyEnabled(): boolean {
  try {
    return localStorage.getItem('rp.chaosSpicy') === '1'
  } catch {
    return false
  }
}

/** Rolls chaos after each reply: pressure climbs 5/turn; triggers when rng < pressure (capped 100). */
export function chaosRoll(state: RealismState | undefined, replyIndex: number, rand: () => number = Math.random, spicy = false): { pressure: number; event?: string } {
  const pressure = Math.min(100, (state?.chaosPressure ?? 0) + 5)
  const roll = rand() * 100
  if (roll < pressure) {
    const pool = CHAOS_EVENTS.filter((e) => spicy || !e.spicy)
    const event = pool[Math.floor(rand() * pool.length)]
    return { pressure: 0, event: event.text }
  }
  return { pressure }
}

export function chaosGuidance(event: string | null | undefined): string {
  if (!event) return ''
  return `本回合事件（必须自然融入剧情，{{char}}和{{user}}都只能对它做戏内反应，绝不能提及任何机制）：${event.replace(/\{\{char\}\}/g, '{{char}}')}`
}

// --- recap -------------------------------------------------------------------

/** Deterministic "where we left off" line when the chat has been idle a while. */
export function recapGuidance(lastMessageAt: number | undefined, now: number): string {
  if (!lastMessageAt) return ''
  const hours = (now - lastMessageAt) / 3_600_000
  if (hours < 12) return ''
  const label = hours < 24 ? '超过半天' : hours < 48 ? '一天多' : `${Math.round(hours / 24)}天`
  return `距上次对话已经${label}。{{char}}可以自然地流露出这段间隔的存在（一次，含糊地，绝不猜测{{user}}去做了什么），也可以只字不提。`
}

/** One-line model-facing note on the slow, sticky bond layer — only once it has meaningfully separated from the daily warmth. */
export function bondLongTermGuidance(bondLongTerm: number | undefined): string {
  if (bondLongTerm === undefined) return ''
  if (bondLongTerm >= 70)
    return "Underneath the turn-to-turn weather, {{char}}'s long-term attachment to {{user}} is deep and settled — they are part of the shape of her life now. Even a bad day or a sharp exchange sits on top of that foundation, never replacing it."
  if (bondLongTerm >= 40)
    return 'Underneath the turn-to-turn weather, {{char}} has quietly built a real, durable attachment to {{user}} — it shows in how easily she lets them back in after friction.'
  if (bondLongTerm <= 20)
    return "Underneath the turn-to-turn weather, {{char}}'s long-term attachment to {{user}} is thin — the connection is recent or shallow, and she does not yet treat them as a fixture of her life."
  return ''
}

// --- journal（FP Journal 吸收：角色自己的日记，确定性情绪物理） ---------------------------------

export interface JournalEntry {
  id: string
  text: string
  /** 0-1 热度：随回合冷却，驱动召回与提示词槽位。 */
  heat: number
  /** 重大事件（闪光灯记忆）：冷却减半，热度有下限。 */
  flashbulb?: boolean
  /** -1..1 这件事对她的情绪色彩，用于心境一致性召回打分。 */
  valence: number
  createdAtReply: number
  lastRecallReply?: number
}

/** 每回合冷却：普通条目 ×0.94，闪光灯 ×0.97 且热度下限 0.12（"有些事忘不掉"）。 */
export function coolJournal(entries: JournalEntry[] | undefined): JournalEntry[] {
  return (entries ?? []).map((e) => {
    const factor = e.flashbulb ? 0.97 : 0.94
    const floor = e.flashbulb ? 0.12 : 0
    return { ...e, heat: Math.max(floor, Math.round(e.heat * factor * 100) / 100) }
  })
}

/**
 * 从判定结果落日记：判定给出的 newFacts（含重要度/情绪色）以及本回合的强波动。
 * importance ≥ 0.75 记为闪光灯记忆；|好感波动| ≥ 2 也值得记一笔。
 */
export function addJournalFromTurn(
  entries: JournalEntry[] | undefined,
  turn: {
    replyIndex: number
    newFacts?: { text: string; importance?: number; valence?: number }[]
    affectionDelta: number
  },
): JournalEntry[] {
  const list = (entries ?? []).map((e) => ({ ...e }))
  for (const f of turn.newFacts ?? []) {
    const importance = f.importance ?? 0.5
    if (importance < 0.4) continue
    const id = "j" + turn.replyIndex + "-" + Math.random().toString(36).slice(2, 8)
    list.push({
      id,
      text: f.text.trim().slice(0, 160),
      heat: Math.max(0.35, Math.min(1, importance)),
      flashbulb: importance >= 0.75,
      valence: f.valence ?? 0,
      createdAtReply: turn.replyIndex,
    })
  }
  if (Math.abs(turn.affectionDelta) >= 2) {
    const valence = Math.sign(turn.affectionDelta)
    const text = valence > 0 ? "{{user}}做了让{{char}}心里一暖的事。" : "{{user}}做了让{{char}}心里不舒服的事。"
    const id = "j" + turn.replyIndex + "-" + Math.random().toString(36).slice(2, 8)
    list.push({ id, text, heat: Math.min(1, 0.45 + Math.abs(turn.affectionDelta) * 0.15), flashbulb: Math.abs(turn.affectionDelta) >= 3, valence, createdAtReply: turn.replyIndex })
  }
  if (list.length > 24) {
    list.sort((a, b) => b.heat - a.heat)
    list.length = 24
  }
  return list
}

/**
 * 召回打分：热度 × 心境一致性（当前情绪为负时负面记忆更易浮起）× 新近度加成。返回前 max 条。
 */
export function recallJournal(
  entries: JournalEntry[] | undefined,
  opts: { moodValence?: number; replyIndex: number; max?: number },
): JournalEntry[] {
  const hot = (entries ?? []).filter((e) => e.heat >= 0.15)
  const moodValence = opts.moodValence ?? 0
  const scored = hot.map((e) => {
    const congruence = 1 + (moodValence !== 0 && Math.sign(e.valence) === moodValence ? 0.25 : 0)
    const recency = 1 + Math.max(0, 1 - (opts.replyIndex - e.createdAtReply) / 40) * 0.2
    return { e, score: e.heat * congruence * recency }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, opts.max ?? 6).map((x) => x.e)
}

/** 提示词注入行：热记忆以"她还记得"的口吻列出，绝不报数值。 */
export function journalGuidance(entries: JournalEntry[] | undefined, replyIndex: number): string {
  const recalled = recallJournal(entries, { replyIndex, max: 5 })
  if (!recalled.length) return ''
  const lines = recalled.map((e) => {
    const tone = e.valence < -0.3 ? '（想起时仍有点刺）' : e.valence > 0.3 ? '（想起时会柔软一瞬）' : ''
    return '- ' + e.text + tone
  }).join("\n")
  return '她记忆里还热着的事（可自然提及或影响语气，不要逐条复述）：\n' + lines
}