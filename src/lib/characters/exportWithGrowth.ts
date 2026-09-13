// P1-1 成长回写：把养出来的年轮 / 关系 / 心结烘焙进角色卡，导出即可带走。
//
// 设计要点（见 P1-1 方案交接）：
// —— 纯函数层（build/with/read/strip/fit）不碰 DOM 与 API，可单测；
// —— 薄 I/O 层（downloadJson/PngWithGrowth）只做取数编排，供 CharacterEditor 调用；
// —— 落点是 chara_card_v2 标准字段 `extensions.rp_growth`，ST 侧未知键忽略；
// —— 读取方必须经 `getRelationshipTrack(chat, charId)` 取 track，禁止直读 chat 顶层。

import type { CharacterCardData } from './cardSpec'
import type {
  Chat,
  ChatFact,
  CommitmentStatus,
  RelationshipDimension,
  RelationshipStage,
  RelationshipTrack,
} from '@/lib/types'
import type { GrowthRing, JournalEntry, OpenPromise } from '@/lib/realism/engine'
import { chatsApi, chatFactsApi } from '@/lib/api/client'
import { getRelationshipTrack } from '@/lib/dating/stage'

/** `extensions.rp_growth` 的版本号 —— readGrowth 只认这个版本，其余优雅降级为 undefined。 */
export const GROWTH_SNAPSHOT_VERSION = 1

/** PNG tEXt chunk 经验安全线 —— 超预算按 journal、facts、summary 顺序截。 */
export const GROWTH_BUDGET_BYTES = 8 * 1024

const MAX_RINGS = 12
const MAX_JOURNAL = 8
const MAX_FACTS = 10
const MAX_SUMMARY_CHARS = 2000

export interface GrowthRingSnapshot {
  text: string
  tier: GrowthRing['tier']
  strength: number
}

export interface GrowthJournalSnapshot {
  text: string
  heat: number
  flashbulb?: boolean
  valence: number
}

export interface GrowthPromiseSnapshot {
  text: string
  by: OpenPromise['by']
  status: OpenPromise['status']
}

export interface GrowthFactSnapshot {
  text: string
  importance?: number
  valence?: number
}

export interface GrowthSnapshot {
  v: typeof GROWTH_SNAPSHOT_VERSION
  exportedAt: number
  chatId: string
  chatTitle?: string
  affection?: number
  stats?: Partial<Record<RelationshipDimension, number>>
  stage?: RelationshipStage
  commitment?: CommitmentStatus
  bondLongTerm?: number
  rings: GrowthRingSnapshot[]
  journal: GrowthJournalSnapshot[]
  promises: GrowthPromiseSnapshot[]
  beliefs: string[]
  expectations: string[]
  facts: GrowthFactSnapshot[]
  summary?: string
  /** fitBudget 动过刀才为 true —— UI 用它提示“已截断”。 */
  truncated?: boolean
}

export interface BuildGrowthInput {
  track: RelationshipTrack
  facts?: ChatFact[]
  summary?: string
  chatId?: string
  chatTitle?: string
  exportedAt?: number
}

function cleanText(v: unknown, max = 160): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function pickRings(rings: GrowthRing[] | undefined): GrowthRingSnapshot[] {
  return (rings ?? [])
    .filter((r) => cleanText(r.text))
    .slice(0, MAX_RINGS)
    .map((r) => ({
      text: cleanText(r.text),
      tier: r.tier,
      strength: typeof r.strength === 'number' ? r.strength : 1,
    }))
}

/**
 * 日记 TopN：flashbulb 豁免截断（“有些事忘不掉”是产品语义），其余按 heat 排。
 * 全 flashbulb 的极端情况仍受 MAX_JOURNAL 上限保护，避免预算爆炸。
 */
function pickJournal(entries: JournalEntry[] | undefined): GrowthJournalSnapshot[] {
  const list = (entries ?? []).filter((e) => cleanText(e.text))
  const flash = list.filter((e) => e.flashbulb)
  const rest = list.filter((e) => !e.flashbulb).sort((a, b) => b.heat - a.heat)
  const merged = [...flash, ...rest].slice(0, MAX_JOURNAL)
  return merged.map((e) => ({
    text: cleanText(e.text),
    heat: e.heat,
    ...(e.flashbulb ? { flashbulb: true } : {}),
    valence: e.valence ?? 0,
  }))
}

/** 仅 open 全留，最近 resolved 3 条（按 resolvedReply 倒序，无序号的视为最旧）。 */
function pickPromises(promises: OpenPromise[] | undefined): GrowthPromiseSnapshot[] {
  const list = (promises ?? []).filter((p) => cleanText(p.text))
  const open = list.filter((p) => p.status === 'open')
  const resolved = list
    .filter((p) => p.status !== 'open')
    .sort((a, b) => (b.resolvedReply ?? -1) - (a.resolvedReply ?? -1))
    .slice(0, 3)
  return [...open, ...resolved].map((p) => ({ text: cleanText(p.text), by: p.by, status: p.status }))
}

function pickFacts(facts: ChatFact[] | undefined): GrowthFactSnapshot[] {
  return (facts ?? [])
    .filter((f) => f.active && cleanText(f.text))
    .sort((a, b) => (b.importance ?? 0.5) - (a.importance ?? 0.5))
    .slice(0, MAX_FACTS)
    .map((f) => ({
      text: cleanText(f.text, 200),
      ...(typeof f.importance === 'number' ? { importance: f.importance } : {}),
      ...(typeof f.valence === 'number' ? { valence: f.valence } : {}),
    }))
}

function pickTexts(items: { text?: string }[] | undefined): string[] {
  return (items ?? []).map((i) => cleanText(i.text, 200)).filter(Boolean)
}

/** 纯函数：从一条 track 及附带材料拼出快照（调用方经 getRelationshipTrack 取 track）。 */
export function buildGrowthSnapshot(input: BuildGrowthInput): GrowthSnapshot {
  const { track, facts, summary, chatId, chatTitle, exportedAt } = input
  const realism = track.realism
  const snap: GrowthSnapshot = {
    v: GROWTH_SNAPSHOT_VERSION,
    exportedAt: exportedAt ?? Date.now(),
    chatId: chatId ?? '',
    ...(chatTitle ? { chatTitle } : {}),
    ...(typeof track.affection === 'number' ? { affection: track.affection } : {}),
    ...(track.relationshipStats ? { stats: { ...track.relationshipStats } } : {}),
    ...(track.relationshipStage ? { stage: track.relationshipStage } : {}),
    ...(track.commitmentStatus ? { commitment: track.commitmentStatus } : {}),
    ...(typeof realism?.bondLongTerm === 'number' ? { bondLongTerm: realism.bondLongTerm } : {}),
    rings: pickRings(realism?.rings),
    journal: pickJournal(realism?.journal),
    promises: pickPromises(realism?.promises),
    beliefs: pickTexts(track.beliefsAboutUser),
    expectations: pickTexts(track.expectationsOfUser),
    facts: pickFacts(facts),
    ...(cleanText(summary ?? '', MAX_SUMMARY_CHARS + 500)
      ? { summary: cleanText(summary, MAX_SUMMARY_CHARS) }
      : {}),
  }
  return fitBudget(snap)
}

function snapshotBytes(s: GrowthSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(s)).length
}

/**
 * 预算保护：超 8KB 按 journal、facts、summary 顺序截，动过刀则标 truncated。
 * rings / promises / beliefs / expectations 体积小且语义完整优先保留。
 */
export function fitBudget(snap: GrowthSnapshot): GrowthSnapshot {
  if (snapshotBytes(snap) <= GROWTH_BUDGET_BYTES) return snap
  const out: GrowthSnapshot = { ...snap, truncated: true }
  while (snapshotBytes(out) > GROWTH_BUDGET_BYTES && out.journal.length > 0) {
    out.journal = out.journal.slice(0, -1)
  }
  while (snapshotBytes(out) > GROWTH_BUDGET_BYTES && out.facts.length > 0) {
    out.facts = out.facts.slice(0, -1)
  }
  while (snapshotBytes(out) > GROWTH_BUDGET_BYTES && out.summary) {
    const cut = Math.max(0, out.summary.length - 500)
    out.summary = out.summary.slice(0, cut) || undefined
    if (!out.summary) break
  }
  return out
}

/** 快照体积（字节），供 UI 显示“约 xKB”。 */
export function growthSnapshotBytes(snap: GrowthSnapshot): number {
  return snapshotBytes(snap)
}

/** 一行规模描述，供导出按钮旁显示（年轮 5 · 日记 8 · 记忆 10 · 约 6KB）。 */
export function describeGrowthSnapshot(snap: GrowthSnapshot): string {
  const kb = (snapshotBytes(snap) / 1024).toFixed(1)
  const parts = [
    `年轮 ${snap.rings.length}`,
    `日记 ${snap.journal.length}`,
    `记忆 ${snap.facts.length}`,
  ]
  if (snap.promises.length) parts.push(`心结 ${snap.promises.length}`)
  if (snap.summary) parts.push('长记忆')
  return `${parts.join(' · ')} · 约 ${kb}KB${snap.truncated ? '（已截断）' : ''}`
}

const GROWTH_KEY = 'rp_growth'

/** 把快照烘焙进卡（不改原对象，返回新卡）。 */
export function withGrowth(card: CharacterCardData, snap: GrowthSnapshot): CharacterCardData {
  return { ...card, extensions: { ...(card.extensions ?? {}), [GROWTH_KEY]: snap } }
}

/** 从卡里读回快照 —— 版本不对或形状不对一律 undefined，不抛错。 */
export function readGrowth(card: CharacterCardData): GrowthSnapshot | undefined {
  const raw = (card.extensions ?? {})[GROWTH_KEY]
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as Partial<GrowthSnapshot>
  if (s.v !== GROWTH_SNAPSHOT_VERSION) return undefined
  if (!Array.isArray(s.rings) || !Array.isArray(s.journal) || !Array.isArray(s.facts)) return undefined
  return s as GrowthSnapshot
}

/** 剥掉快照（回滚导出用），其余 extensions 原样保留。 */
export function stripGrowth(card: CharacterCardData): CharacterCardData {
  if (!card.extensions || !(GROWTH_KEY in card.extensions)) return card
  const { [GROWTH_KEY]: _dropped, ...rest } = card.extensions
  return { ...card, extensions: rest }
}

// —— 薄 I/O 层：只做取数编排，纯函数仍可独立单测 ——
//
// 取数口径（P1-1 方案 2.2）：成长状态随聊天走，所以拿"这个角色最近一段聊天"的 track。
// 必须经 getRelationshipTrack —— 群聊里主角与配角的 track 不同袋，直读 chat 顶层会拿错人。

export interface GrowthLoadResult {
  snap: GrowthSnapshot
  chat?: Chat
}

/** 找该角色最近更新的一段聊天（没有则 undefined）。 */
export function pickLatestChat(chats: Chat[], characterId: string): Chat | undefined {
  return chats
    .filter((c) => c.characterId === characterId || c.participants?.includes(characterId))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
}

/**
 * 取数：最近一段聊天 + 其 track + 活跃事实 -> 快照。
 * 没有任何聊天时返回一份空快照（导出仍然成功，只是没有成长内容）。
 */
export async function loadGrowthSnapshot(characterId: string): Promise<GrowthLoadResult> {
  const chats = await chatsApi.list()
  const chat = pickLatestChat(chats, characterId)
  if (!chat) {
    return {
      snap: buildGrowthSnapshot({ track: {}, chatId: '', exportedAt: Date.now() }),
    }
  }
  const track = getRelationshipTrack(chat, characterId)
  let facts: ChatFact[] = []
  try {
    facts = await chatFactsApi.listByChat(chat.id)
  } catch {
    // 事实表取不到不该挡住导出 —— 成长里最值钱的是年轮/心结/长记忆。
    facts = []
  }
  const snap = buildGrowthSnapshot({
    track,
    facts,
    summary: chat.summary,
    chatId: chat.id,
    chatTitle: chat.title,
    exportedAt: Date.now(),
  })
  return { snap, chat }
}
