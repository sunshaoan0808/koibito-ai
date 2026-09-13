import type { ChatMessage } from '@/lib/prompt/builder'
import type { ChatBackend } from '@/lib/api/chatBackend'
import { generateWithTimeout } from '@/lib/api/generateWithTimeout'
import { parseLenientJson } from '@/lib/jsonRepair'
import type { ChoiceOption } from '@/lib/types'

const GENERATE_PARAMS = {
  max_length: 250,
  temperature: 0.95,
  top_p: 0.95,
  top_k: 0,
  min_p: 0.05,
  typical: 1,
  tfs: 1,
  rep_pen: 1.1,
  rep_pen_range: 1024,
  rep_pen_slope: 0.7,
  stop_sequence: ['\n\n\n', '```'],
  trim_stop: true,
}

function renderContext(history: ChatMessage[], charName: string, userName: string, depth: number): string {
  return history
    .slice(-depth)
    .filter((m) => m.text.trim())
    // Label each line with the turn's actual speaker (`m.name`) rather than a single `charName`
    // for every non-user line — in a group scene that one name would mislabel every participant's
    // turn as the primary's, exactly the context a post-reply choice suggestion reads to stay on
    // topic. Falls back to the role-based name for any stray unnamed entry.
    .map((m) => `${m.name?.trim() || (m.role === 'user' ? userName : charName)}: ${m.text}`)
    .join('\n')
}

/**
 * Proposes a few distinct directions the user could take next — the multiple-choice prompt shown
 * after a reply lands, so picking one nudges the scene forward instead of staring at a blank composer.
 */
export async function generateChoices(
  client: ChatBackend,
  params: {
    history: ChatMessage[]
    charName: string
    userName: string
    count?: number
    availableGifts?: { id: string; name: string; quantity: number }[]
  },
): Promise<ChoiceOption[]> {
  const count = params.count ?? 3
  const jsonObject = client.prefersJsonObject === true
  const context = renderContext(params.history, params.charName, params.userName, 8)
  const prompt = [
    '你在为一个角色扮演的参与者构思接下来可以说什么、做什么，帮助他挑选剧情方向。',
    `最近的场景：\n${context}`,
    params.availableGifts?.length
      ? `当前可以赠送的礼物：${params.availableGifts.map((g) => `${g.id} (${g.name}) x${g.quantity}`).join(', ')}`
      : '当前没有可以赠送的礼物。',
    `为${params.userName}提出 ${count} 个简短且方向不同的行动选项（他接下来可以说什么或做什么）。每个选项的语气和思路要彼此不同。`,
    `只输出 ${jsonObject ? `一个压缩的 JSON 对象，其中含 "choices" 数组，数组内是` : '一个压缩的 JSON 数组，元素是'} ${count} 个对象，结构必须是：{"kind":"line|action|gift","label":"按钮上的短文字","text":"实际要作为${params.userName}回合发送的台词或动作","giftId":"kind=gift 时必填","giftName":"可选"}。所有文字（包括动作）都必须是合法的 JSON 字符串。`,
    `最多只能有一个 kind="gift" 的选项，且仅当上面的礼物列表里确实有礼物时才给出。不要 markdown 代码块，不要任何解释文字。用简体中文书写 label 和 text。`,
    'JSON:',
  ].join('\n\n')

  // A hang here (backend never responds) used to leave the "choices" background-assist indicator
  // stuck forever with nothing to show for it — `generateWithTimeout` bounds it to 45s, after which
  // the caller's own catch-everything wrapper clears the indicator same as any other failure.
  const text = await generateWithTimeout(
    client,
    { ...GENERATE_PARAMS, ...(jsonObject ? { jsonOutput: true } : {}), max_context_length: await client.getEffectiveMaxContext(), prompt },
    'Suggest choices',
  )
  const result = parseLenientJson(text)
  const parsed = jsonObject && result && typeof result === 'object' && !Array.isArray(result)
    ? (result as { choices?: unknown }).choices : result
  if (!Array.isArray(parsed)) return []
  const options: ChoiceOption[] = []
  let giftCount = 0
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue
    const obj = raw as Record<string, unknown>
    const kind = obj.kind === 'action' || obj.kind === 'gift' ? obj.kind : 'line'
    if (kind === 'gift') {
      giftCount += 1
      if (giftCount > 1) continue
    }
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    const textValue = typeof obj.text === 'string' ? obj.text.trim() : ''
    if (!label || !textValue) continue
    const giftId = typeof obj.giftId === 'string' ? obj.giftId.trim() : undefined
    if (kind === 'gift' && !giftId) continue
    options.push({
      id: `choice-${options.length}-${Date.now()}`,
      kind,
      label,
      text: textValue,
      giftId,
      giftName: kind === 'gift' && typeof obj.giftName === 'string' ? obj.giftName.trim() : undefined,
    })
    if (options.length >= count) break
  }
  return options
}
