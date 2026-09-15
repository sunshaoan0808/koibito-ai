import { describe, expect, it } from 'vitest'
import {
  buildSlopAvoidanceNote,
  cleanModelOutput,
  EXPLICIT_ANTI_PATTERN_ENTRIES,
  findEchoMatch,
  findRepeatedPhrases,
  balanceTrailingMarkup,
  endsCleanly,
  findSlop,
  findSlopAcross,
  isDuplicateOfRecentText,
  isEchoOfHistory,
  isVerbatimEcho,
  measureDuplicateRate,
  PARROT_ECHO_MIN_LENGTH,
  PARROT_ECHO_THRESHOLD,
  stripThinkBlocks,
  textSimilarity,
  trimToLastSentence,
} from './slop'

describe('cleanModelOutput — meta/preamble removal', () => {
  it('returns ordinary prose untouched', () => {
    const text = '*She leans against the doorframe.* "You\'re late again."'
    expect(cleanModelOutput(text)).toBe(text)
  })

  it('strips a leading affirmation line', () => {
    expect(cleanModelOutput('Certainly! Here is the scene:\n\n*She turns.* "Hi."')).toBe('*She turns.* "Hi."')
  })

  it('strips an echoed speaker prefix for the actual speaker only', () => {
    expect(cleanModelOutput('Sumire: "What do you want?"', { charName: 'Sumire' })).toBe('"What do you want?"')
    // A different name mid-dialogue is one character addressing another, not an echo.
    expect(cleanModelOutput('"Kai, wait." *She grabs his sleeve.*', { charName: 'Sumire' })).toBe(
      '"Kai, wait." *She grabs his sleeve.*',
    )
  })

  it('drops OOC asides and assistant chatter anywhere in the reply', () => {
    const raw = '"Fine, come in."\n(OOC: let me know if you want a different tone)\nLet me know if this works for you!'
    expect(cleanModelOutput(raw)).toBe('"Fine, come in."')
  })

  it('removes markdown heading markers and collapses blank runs', () => {
    expect(cleanModelOutput('# Scene\n\n\n\n"Sit."')).toBe('Scene\n\n"Sit."')
  })

  it('cuts a fabricated next turn at a stray name prefix', () => {
    const raw = '"See you tomorrow."\nKai: "Wait, one more thing."'
    expect(cleanModelOutput(raw, { charName: 'Sumire', personaName: 'Kai' })).toBe('"See you tomorrow."')
  })

  it('scrubs an impersonation suggestion: names swapped, so a leading persona label goes and a run-on into the character is cut', () => {
    // `impersonate()` in useChatSession calls it this way — persona is the expected speaker here.
    const raw = 'Kai: *I lean over and kiss her cheek.* "I\'ll be right back."\nSumire: *She catches his hand.*'
    expect(cleanModelOutput(raw, { charName: 'Kai', personaName: 'Sumire' })).toBe(
      '*I lean over and kiss her cheek.* "I\'ll be right back."',
    )
  })

  it('drops a lone unclosed trailing asterisk', () => {
    expect(cleanModelOutput('"Whatever," she mutters. *')).toBe('"Whatever," she mutters.')
  })

  it('converts <i>/<b> action formatting to a single-asterisk action', () => {
    expect(cleanModelOutput('<i>She looks up.</i> "What?"')).toBe('*She looks up.* "What?"')
    expect(cleanModelOutput('<b>No.</b>')).toBe('*No.*')
  })

  it('collapses **bold** / ***both*** action runs to a single asterisk', () => {
    expect(cleanModelOutput('**She narrows her eyes.** "Fine."')).toBe('*She narrows her eyes.* "Fine."')
    expect(cleanModelOutput('***she whispers***')).toBe('*she whispers*')
  })

  it('strips stray tags and broken tag salad', () => {
    expect(cleanModelOutput('"Who are you?" <b><i><i></b> she asks.')).toBe('"Who are you?"  she asks.')
    expect(cleanModelOutput('Text with <p>a block tag</p> in it')).toBe('Text with a block tag in it')
  })

  it('leaves a bare less-than in prose alone', () => {
    expect(cleanModelOutput('He muttered that x < y was obvious.')).toBe('He muttered that x < y was obvious.')
  })

  it('is idempotent', () => {
    const raw = 'Sumire: Certainly!\n\n## Scene\n"Hello."\n(OOC: note)'
    const once = cleanModelOutput(raw, { charName: 'Sumire' })
    expect(cleanModelOutput(once, { charName: 'Sumire' })).toBe(once)
  })

  it("strips a leaked relationship-guidance block (FIXES_TODO.md's live-reproduced bug), leaving real dialogue around it intact", () => {
    const leaked =
      '*She glances up.* "Hey."\n' +
      'Relationship: Kai and Sumire are at the "near strangers" stage.\n' +
      '(Let this colour tone, warmth, and what feels earned right now. Never state a number, "affection", or "stage" out loud.)\n' +
      '"Took you long enough."'
    expect(cleanModelOutput(leaked)).toBe('*She glances up.* "Hey."\n"Took you long enough."')
  })

  it('strips the leaked block even when it is the ENTIRE reply, leaving nothing behind (so the existing empty-reply check catches it)', () => {
    const onlyLeak =
      'Relationship: Kai and Sumire are at the "near strangers" stage.\n' +
      '(Let this colour tone, warmth, and what feels earned right now. Never state a number, "affection", or "stage" out loud.)'
    expect(cleanModelOutput(onlyLeak)).toBe('')
  })

  it("does NOT catch every possible line of the leaked block on its own (e.g. the pacing/gift-taste notes) — that broader case is `useChatSession.ts`'s job via `isDuplicateOfRecentText` against the reconstructed relationshipDescription text, not this function's", () => {
    const partialSurvivor =
      'Relationship: Kai and Sumire are at the "near strangers" stage.\n' +
      '(Let this colour tone, warmth, and what feels earned right now. Never state a number, "affection", or "stage" out loud.)\n' +
      "Sumire feels most loved through Quality time."
    expect(cleanModelOutput(partialSurvivor)).toBe('Sumire feels most loved through Quality time.')
  })

  it('straightens curly quotes to plain ASCII ones', () => {
    expect(cleanModelOutput('“You’re impossible,” she said.')).toBe('"You\'re impossible," she said.')
  })

  it('strips italics wrapping an entire quoted line, whether the asterisks sit outside or inside the quotes', () => {
    expect(cleanModelOutput('*"I don\'t know why."*')).toBe('"I don\'t know why."')
    expect(cleanModelOutput('"*I don\'t know why.*"')).toBe('"I don\'t know why."')
  })

  it('leaves partial emphasis on a single word inside otherwise-plain dialogue alone', () => {
    expect(cleanModelOutput('"I *really* mean it."')).toBe('"I *really* mean it."')
  })

  it('only strips the italicized quote, leaving a genuine action beat next to it untouched', () => {
    expect(cleanModelOutput('"*Hey.*" *She turns.* "*Bye.*"')).toBe('"Hey." *She turns.* "Bye."')
  })
})

describe('findSlop', () => {
  it('flags a recognised tell', () => {
    expect(findSlop("She couldn't help but smile.").map((h) => h.id)).toContain('couldnt-help')
  })

  it('does not flag plain prose', () => {
    expect(findSlop('She smiled and said nothing for a while.')).toEqual([])
  })

  it('counts across several turns and sorts by frequency', () => {
    const hits = findSlopAcross([
      'The air was thick with tension.',
      "He couldn't help but stare.",
      "She couldn't help but laugh.",
    ])
    expect(hits[0].id).toBe('couldnt-help')
    expect(hits[0].count).toBe(2)
  })

  it('scans extraPatterns alongside the base corpus, but only when passed', () => {
    const withExtra = findSlopAcross(['He entered her, slow at first.'], EXPLICIT_ANTI_PATTERN_ENTRIES)
    expect(withExtra.map((h) => h.label)).toContain('he entered her')
    expect(findSlopAcross(['He entered her, slow at first.'])).toEqual([])
  })
})

describe('findRepeatedPhrases', () => {
  it('names a verbatim phrase repeated across turns', () => {
    const repeats = findRepeatedPhrases([
      'She tilts her head to the side and studies you.',
      'Later, she tilts her head to the side again.',
    ])
    expect(repeats[0].phrase).toContain('tilts her head to the side')
    expect(repeats[0].count).toBe(2)
  })

  it('ignores a phrase used only once', () => {
    expect(findRepeatedPhrases(['A completely unique sentence here.', 'Another unrelated line of text.'])).toEqual([])
  })
})

describe('buildSlopAvoidanceNote', () => {
  it('returns undefined when recent turns are clean', () => {
    expect(buildSlopAvoidanceNote(['"Hey." *She waves.*', '"Sit down, then."'])).toBeUndefined()
  })

  it('names the specific tells the character has used', () => {
    const note = buildSlopAvoidanceNote([
      "She couldn't help but grin.",
      'A ghost of a smile crossed her lips.',
    ])
    expect(note).toContain("couldn't help but")
    expect(note).toContain('ghost of a smile')
  })

  it('ignores the player-supplied turns (caller passes char turns only)', () => {
    expect(buildSlopAvoidanceNote([])).toBeUndefined()
  })

  it('names a peak-phase anti-pattern already used, when extraPatterns is passed (explicit-rated chats only)', () => {
    const note = buildSlopAvoidanceNote(['*She gasped as he entered her, slow at first.*'], {
      extraPatterns: EXPLICIT_ANTI_PATTERN_ENTRIES,
    })
    expect(note).toContain('he entered her')
  })

  it('never surfaces an explicit anti-pattern without extraPatterns — the caller gates this to explicit-rated chats', () => {
    expect(buildSlopAvoidanceNote(['*She gasped as he entered her, slow at first.*'])).toBeUndefined()
  })
})

describe('endsCleanly', () => {
  it('accepts a finished sentence, with or without a trailing quote/asterisk/bracket', () => {
    expect(endsCleanly('She looks up. "What do you want?"')).toBe(true)
    expect(endsCleanly('*She turns away.*')).toBe(true)
    expect(endsCleanly('Ask her yourself (if you dare).')).toBe(true)
    expect(endsCleanly('"I already told you"')).toBe(true) // bare closing quote, unpunctuated dialogue
    expect(endsCleanly('It trails off...')).toBe(true)
    expect(endsCleanly('')).toBe(true)
  })

  it('rejects a reply cut off mid-sentence', () => {
    expect(endsCleanly('She reaches for the')).toBe(false)
    expect(endsCleanly('"Fine, but only if you promise to')).toBe(false)
    expect(endsCleanly('He steps closer,')).toBe(false)
  })

  it('rejects a reply that ends on a period but left an action beat or quote open', () => {
    // The screenshot case: sentence-final punctuation, but the closing `*` never came.
    expect(endsCleanly('"Don\'t watch me waste it."\n\n*She says it like a warning.')).toBe(false)
    expect(endsCleanly('She looks up. "I already said no.')).toBe(false)
  })
})

describe('balanceTrailingMarkup', () => {
  it('closes an action beat a stop sequence cut off mid-mark', () => {
    expect(balanceTrailingMarkup('*She says it like a warning.')).toBe('*She says it like a warning.*')
  })

  it('closes an open line of dialogue', () => {
    expect(balanceTrailingMarkup('"The paper is expensive. Don\'t watch me waste it.')).toBe(
      '"The paper is expensive. Don\'t watch me waste it."',
    )
  })

  it('closes a quote nested inside an action beat, quote first', () => {
    expect(balanceTrailingMarkup('*She mutters, "not again.')).toBe('*She mutters, "not again."*')
  })

  it('drops a bare trailing mark with nothing inside it', () => {
    expect(balanceTrailingMarkup('She turns away. *')).toBe('She turns away.')
  })

  it('leaves balanced text alone', () => {
    const t = '*She turns away.* "Goodnight."'
    expect(balanceTrailingMarkup(t)).toBe(t)
  })
})

describe('trimToLastSentence', () => {
  it('leaves a cleanly-ended reply alone', () => {
    expect(trimToLastSentence('"I said no." *She crosses her arms.*')).toBe('"I said no." *She crosses her arms.*')
  })

  it('trims a dangling half-sentence back to the last full one', () => {
    expect(trimToLastSentence('"Fine, come with me, we do not have the whole night to stand here." She grabbed')).toBe(
      '"Fine, come with me, we do not have the whole night to stand here."',
    )
  })

  it('bails rather than gut a reply that is one long unpunctuated run', () => {
    const text = 'she kept walking and did not look back even once as the rain started to come down harder'
    expect(trimToLastSentence(text)).toBe(text)
  })
})

describe('isVerbatimEcho', () => {
  const priorText = "I keep thinking about how much of my week is just built around when I get to see you next."

  it('catches a bare echo of the immediately-preceding message', () => {
    expect(isVerbatimEcho(priorText, priorText)).toBe(true)
  })

  it('catches the same echo with a stray one-word speaker label glued on the front', () => {
    expect(isVerbatimEcho(`Kai: ${priorText}`, priorText)).toBe(true)
  })

  it('catches it with a two-word speaker label too', () => {
    expect(isVerbatimEcho(`Kai Tanaka: ${priorText}`, priorText)).toBe(true)
  })

  it('is insensitive to surrounding whitespace on either side', () => {
    expect(isVerbatimEcho(`  ${priorText}  \n`, `\n${priorText}  `)).toBe(true)
  })

  it('does not flag a genuinely new reply', () => {
    expect(isVerbatimEcho('"You can\'t just say that." Her voice cracks once before she steadies it.', priorText)).toBe(false)
  })

  it('does not flag a short reply that legitimately starts with a capitalized clause before a colon', () => {
    // The exact failure mode this is narrow on purpose to avoid: stripping the opening clause of a
    // real sentence that happens to contain an early colon, rather than an actual speaker label.
    expect(isVerbatimEcho('Chapter One: this is not an echo at all.', priorText)).toBe(false)
  })

  it('returns false with no prior message to compare against (e.g. the very first line of a chat)', () => {
    expect(isVerbatimEcho(priorText, undefined)).toBe(false)
    expect(isVerbatimEcho(priorText, '')).toBe(false)
  })

  it('does not flag a reply that merely starts the same way as the prior message but genuinely continues differently', () => {
    expect(isVerbatimEcho(`${priorText} That's not a complaint.`, priorText)).toBe(false)
  })
})

describe('isDuplicateOfRecentText', () => {
  const oldCharTurn =
    "Her grip tightens on the paperback. She turns a page she hasn't read, the sound of paper louder than it needs to be. \"...Fine.\" Flat. Final. \"Then sit across from the door. Quietly.\""
  const nextCharTurn =
    "She doesn't look up from the book for a long time. When she finally speaks, her voice is flat. \"...It's not raining yet.\" She turns a page."
  const oldUserTurn =
    "I don't push it, just smile and go back to unpacking the last of her boxes into the shelf we built together. \"Okay. Whenever. This is already more than I used to let myself want.\""

  it("live shape 1: catches a reply that's just the tail end of an earlier message", () => {
    expect(isDuplicateOfRecentText(oldCharTurn.slice(-50), [oldCharTurn])).toBe(true)
  })

  it('live shape 2: catches a reply that concatenates the last two char turns with nothing new written', () => {
    const concatenated = oldCharTurn + '\n' + nextCharTurn.slice(0, 60)
    expect(isDuplicateOfRecentText(concatenated, [oldCharTurn, nextCharTurn])).toBe(true)
  })

  it("live shape 3: catches an exact copy of the PLAYER's own earlier line presented as the character's turn", () => {
    expect(isDuplicateOfRecentText(oldUserTurn, [oldUserTurn])).toBe(true)
  })

  it('does not flag a genuinely new reply that merely continues the same scene', () => {
    const genuinelyNew =
      "Sumire's fingers tightened in his, once. Just once. Her shoulders dropped a little, like something she'd been holding unclenched. \"...All right.\""
    expect(isDuplicateOfRecentText(genuinelyNew, [oldCharTurn, nextCharTurn, oldUserTurn])).toBe(false)
  })

  it('never flags a short reply, even one that legitimately recurs verbatim ("...Fine." twice in one chat is normal)', () => {
    expect(isDuplicateOfRecentText('...Fine.', ['...Fine.', oldCharTurn])).toBe(false)
  })

  it('ignores undefined/empty entries in the comparison list', () => {
    expect(isDuplicateOfRecentText(oldCharTurn, [undefined, '', oldCharTurn])).toBe(true)
    expect(isDuplicateOfRecentText('a genuinely fresh reply, long enough to be checked at all here', [undefined, ''])).toBe(false)
  })

  it('is insensitive to whitespace differences between what was stored and what was just produced', () => {
    const withDifferentSpacing = oldCharTurn.replace(/\s+/g, '\n')
    expect(isDuplicateOfRecentText(withDifferentSpacing, [oldCharTurn])).toBe(true)
  })
})

describe('textSimilarity', () => {
  const line = 'She keeps a photo of her grandmother in her wallet.'

  it('is 1 for the same text', () => {
    expect(textSimilarity(line, line)).toBe(1)
  })

  it('falls to 1 once casing, markup, punctuation and whitespace are normalised away', () => {
    // The shapes a stored fact and its restatement actually differ by.
    expect(textSimilarity(`*${line}*`, `  ${line.toLowerCase()}  `)).toBe(1)
    expect(textSimilarity('She keeps a photo\nof her grandmother   in her wallet.', line)).toBe(1)
    expect(textSimilarity('Likes tea', 'Likes tea.')).toBe(1)
  })

  it('stays high but below 1 for a single swapped word', () => {
    const edited = 'He always orders the same thing at the bar on Fridays.'
    const original = 'He always orders the same thing at the cafe on Fridays.'
    const similarity = textSimilarity(edited, original)
    expect(similarity).toBeGreaterThan(0.9)
    expect(similarity).toBeLessThan(1)
  })

  it('is low for two unrelated lines', () => {
    expect(textSimilarity(line, 'She hates the smell of lavender candles.')).toBeLessThan(0.4)
  })

  it('is symmetric', () => {
    expect(textSimilarity(line, 'A different line entirely, nothing shared here at all.')).toBe(
      textSimilarity('A different line entirely, nothing shared here at all.', line),
    )
  })

  it('is 0 when either side normalises away to nothing', () => {
    expect(textSimilarity('', line)).toBe(0)
    expect(textSimilarity(line, '   ')).toBe(0)
    expect(textSimilarity('!!! ... ***', line)).toBe(0)
  })
})

describe('findEchoMatch / isEchoOfHistory — full-history anti-parrot scan', () => {
  // A turn the model rebuilt from several messages back. This is the shape the immediate-prior
  // check (`isVerbatimEcho`) cannot see, and the reason this scan exists.
  const echoed = 'Sumire would rather walk home in the rain than ask him for the umbrella he keeps in his bag.'
  const earlier = 'He counts the change twice, then pockets it without meeting her eye.'
  const middle = 'The bus goes past without stopping and neither of them mentions it.'
  const immediatePrior = 'She waits under the awning and pretends the rain is not a problem.'
  const history = [earlier, middle, echoed, immediatePrior]

  it('catches a turn rebuilt verbatim from earlier in the window, which the immediate-prior check misses', () => {
    // Baseline, on purpose: the old gate only ever looks at the message right before the candidate.
    expect(isVerbatimEcho(echoed, immediatePrior)).toBe(false)
    expect(isEchoOfHistory(echoed, history)).toBe(true)
    expect(findEchoMatch(echoed, history)?.index).toBe(2)
  })

  it('catches a lightly edited copy of an earlier turn', () => {
    const original = 'He puts the kettle on before he says anything at all, every time the room goes quiet.'
    const edited = original.replace('all', 'else')
    const match = findEchoMatch(edited, ['Something else entirely was said here first.', original])
    expect(match?.index).toBe(1)
    expect(match?.similarity).toBeGreaterThanOrEqual(PARROT_ECHO_THRESHOLD)
    expect(match?.text).toBe(original)
  })

  it('catches a plain echo that only differs in markup, whitespace and speaker labelling', () => {
    expect(isEchoOfHistory(`*${echoed}*`, [echoed])).toBe(true)
    expect(isEchoOfHistory(`Kai: ${echoed}`, [echoed])).toBe(true)
  })

  it('ignores undefined and empty entries in the window', () => {
    expect(findEchoMatch(echoed, [undefined, '', '   ', echoed])?.index).toBe(3)
  })

  it('never flags a short line, even one that recurs verbatim', () => {
    expect(echoed.length).toBeGreaterThan(PARROT_ECHO_MIN_LENGTH)
    expect(isEchoOfHistory('...Fine.', ['...Fine.'])).toBe(false)
    expect(findEchoMatch('...Fine.', ['...Fine.'])).toBeUndefined()
  })

  it('leaves a genuine continuation alone, even though it opens with the same words', () => {
    const prior = 'She sets the cup down without looking at him.'
    const continued = `${prior} Then she leaves without another word.`
    expect(textSimilarity(continued, prior)).toBeLessThan(PARROT_ECHO_THRESHOLD)
    expect(isEchoOfHistory(continued, [prior])).toBe(false)
  })

  it('leaves a genuinely new reply alone', () => {
    const fresh = 'She tells him about the letter her mother sent and waits for him to answer.'
    expect(isEchoOfHistory(fresh, history)).toBe(false)
  })

  it('honours a caller-supplied threshold in both directions', () => {
    const original = 'He puts the kettle on before he says anything at all, every time the room goes quiet.'
    const edited = original.replace('all', 'else')
    // Stricter than the default: the one-word edit no longer counts.
    expect(isEchoOfHistory(edited, [original], { threshold: 0.999 })).toBe(false)
    // Looser: a paraphrase the default gate deliberately lets through now counts.
    const paraphrase = 'He has one sister, Mira, and he mentions her often.'
    const plain = 'He has a sister named Mira who he mentions often.'
    expect(textSimilarity(paraphrase, plain)).toBeGreaterThan(0.5)
    expect(isEchoOfHistory(paraphrase, [plain], { threshold: 0.5 })).toBe(true)
    expect(isEchoOfHistory(paraphrase, [plain])).toBe(false)
  })

  it('counts a shorter minimum length when a caller asks it to', () => {
    expect(findEchoMatch('Oh.', ['Oh.'], { minLength: 2 })?.index).toBe(0)
  })

  it('returns undefined for an empty window or an unusable candidate', () => {
    expect(findEchoMatch(echoed, [])).toBeUndefined()
    expect(findEchoMatch('', [echoed])).toBeUndefined()
  })
})

describe('measureDuplicateRate — the baseline number', () => {
  const a = 'She puts the kettle on and does not say anything for a while.'
  const b = 'He asks about the letter and she pretends not to hear it the first time.'
  const c = 'The rain gets louder against the window and neither of them moves.'
  const shortLine = 'oh.'

  it('is 0 for an empty list and for a history with no repeats', () => {
    expect(measureDuplicateRate([])).toEqual({ total: 0, comparable: 0, duplicates: 0, rate: 0 })
    expect(measureDuplicateRate([a, b, c])).toEqual({ total: 3, comparable: 3, duplicates: 0, rate: 0 })
    // Too short to be comparable at all, so the list contributes nothing to the denominator.
    expect(measureDuplicateRate([shortLine, shortLine]).rate).toBe(0)
  })

  it('counts a repeat that comes back later in the history, and skips lines too short to judge', () => {
    const report = measureDuplicateRate([a, b, c, a, shortLine])
    expect(report).toEqual({ total: 5, comparable: 4, duplicates: 1, rate: 0.25 })
  })

  it('measures against the whole history, where an immediate-prior baseline sees nothing', () => {
    const turns = [a, b, c, a]
    // Baseline: the old gate only compares a turn with the one before it — 0 duplicates here.
    const baselineDuplicates = turns.filter((t, i) => i > 0 && isVerbatimEcho(t, turns[i - 1])).length
    expect(baselineDuplicates).toBe(0)
    expect(measureDuplicateRate(turns).duplicates).toBe(1)
    expect(measureDuplicateRate(turns).rate).toBeGreaterThan(baselineDuplicates / turns.length)
  })
})

describe('stripThinkBlocks — leaked thinking removal', () => {
  it('returns ordinary prose untouched', () => {
    const text = '*She turns.* "Hi."'
    expect(stripThinkBlocks(text)).toBe(text)
  })

  it('strips a MortalThink block and keeps the reply', () => {
    expect(stripThinkBlocks('<MortalThink>\n好的,缪斯.\n</MortalThink>\n\n"你好。"')).toBe('\n\n"你好。"')
  })

  it('strips thinking/think blocks case-insensitively', () => {
    expect(stripThinkBlocks('<THINKING>plan</THINKING>"Hi."')).toBe('"Hi."')
    expect(stripThinkBlocks('<think>hmm</think> *She smiles.*')).toBe(' *She smiles.*')
  })

  it('drops an unclosed trailing block', () => {
    expect(stripThinkBlocks('"Hi."\n<MortalThink>\ncut off')).toBe('"Hi."\n')
  })

  it('cleanModelOutput removes a leaked block end to end', () => {
    expect(cleanModelOutput('<MortalThink>\n好的.\n</MortalThink>\n\n"你好。"')).toBe('"你好。"')
  })
})
