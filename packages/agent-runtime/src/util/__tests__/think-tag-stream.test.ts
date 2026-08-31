import { describe, expect, it } from 'bun:test'

import {
  historyLeaksThinkTags,
  IMPLICIT_OPEN_BUDGET_CHARS,
  stripThinkScaffolding,
  ThinkTagStream,
} from '../think-tag-stream'

import type { ThinkStreamSegment } from '../think-tag-stream'

/** Feed the deltas one at a time, then flush — the shape a real stream has. */
function run(
  deltas: string[],
  options?: { implicitOpen?: boolean },
): ThinkStreamSegment[] {
  const stream = new ThinkTagStream(options)
  const out: ThinkStreamSegment[] = []
  for (const delta of deltas) out.push(...stream.push(delta))
  out.push(...stream.flush())
  return out
}

const joined = (segments: ThinkStreamSegment[], type: 'text' | 'reasoning') =>
  segments
    .filter((s) => s.type === type)
    .map((s) => s.text)
    .join('')

/** Split into single characters — the worst case for tag detection. */
const chars = (text: string) => [...text]

describe('ThinkTagStream — paired tags', () => {
  it('routes a paired block to reasoning and keeps the answer as text', () => {
    const out = run(['<think>plan it</think>Here is the answer.'])
    expect(out).toEqual([
      { type: 'reasoning', text: 'plan it' },
      { type: 'text', text: 'Here is the answer.' },
    ])
  })

  it('never emits a tag as text, however the deltas are split', () => {
    const out = run(chars('before<think>thought</think>after'))
    expect(joined(out, 'text')).toBe('beforeafter')
    expect(joined(out, 'reasoning')).toBe('thought')
  })

  it('holds a trailing partial tag rather than emitting it', () => {
    const stream = new ThinkTagStream()
    expect(stream.push('answer</thi')).toEqual([
      { type: 'text', text: 'answer' },
    ])
    expect(stream.push('nk>tail')).toEqual([{ type: 'text', text: 'tail' }])
  })

  it('releases a partial tag that never completed as ordinary text', () => {
    // Segments merge within one push, not across them — so compare the text.
    expect(joined(run(['a < b']), 'text')).toBe('a < b')
    expect(joined(run(['ends with <']), 'text')).toBe('ends with <')
  })

  it('releases an unclosed open tag as text at flush', () => {
    // The open may be a truncated thought or the tag quoted as prose — both
    // look identical until the step ends, so the hold resolves as text either
    // way: an answer is delayed, never swallowed (issue #1155, bug 2).
    const out = run(['<think>truncated thou', 'ght'])
    expect(joined(out, 'reasoning')).toBe('')
    expect(joined(out, 'text')).toBe('truncated thought')
  })

  it('keeps an answer quoted around a prose open tag as text', () => {
    // Docs quoting the tag: the answer before it already streamed as text,
    // the text after it must not vanish into the thinking box.
    const out = run([
      'Write <think> ',
      'like this in your docs. The answer continues here.',
    ])
    expect(joined(out, 'reasoning')).toBe('')
    expect(joined(out, 'text')).toBe(
      'Write  like this in your docs. The answer continues here.',
    )
  })

  it('holds an explicit open only until its close arrives', () => {
    const stream = new ThinkTagStream()
    expect(stream.push('Answer part one. <think>plan it')).toEqual([
      { type: 'text', text: 'Answer part one. ' },
    ])
    expect(stream.push('</think>Here is the answer.')).toEqual([
      { type: 'reasoning', text: 'plan it' },
      { type: 'text', text: 'Here is the answer.' },
    ])
  })

  it('releases an explicit open on a native reasoning chunk as text', () => {
    const stream = new ThinkTagStream()
    expect(stream.push('A <think> quoted open')).toEqual([
      { type: 'text', text: 'A ' },
    ])
    expect(stream.disarmImplicitOpen()).toEqual([
      { type: 'text', text: ' quoted open' },
    ])
    expect(stream.push(' and the answer continues')).toEqual([
      { type: 'text', text: ' and the answer continues' },
    ])
  })
})

describe('ThinkTagStream — orphan close, not armed', () => {
  // The default for every non-leaking model: the prose is not reclassified
  // (it already streamed), but the bare marker must never reach a transcript.
  it('strips the marker and keeps surrounding prose as text', () => {
    const out = run(['Saw the anchor.</think>Now find the splitter.'])
    expect(out).toEqual([
      { type: 'text', text: 'Saw the anchor.Now find the splitter.' },
    ])
  })

  it('strips a marker arriving on its own delta', () => {
    const out = run(['done', '</think>', ' more'])
    expect(joined(out, 'text')).toBe('done more')
    expect(joined(out, 'reasoning')).toBe('')
  })
})

describe('ThinkTagStream — orphan close, armed', () => {
  it('reclassifies the head as reasoning once the marker lands', () => {
    const out = run(
      ['Ключевая зацепка: the bundle knows the type.', 'Do that.</think>Real answer.'],
      { implicitOpen: true },
    )
    expect(out).toEqual([
      {
        type: 'reasoning',
        text: 'Ключевая зацепка: the bundle knows the type.Do that.',
      },
      { type: 'text', text: 'Real answer.' },
    ])
  })

  it('emits nothing until the marker settles the head', () => {
    const stream = new ThinkTagStream({ implicitOpen: true })
    expect(stream.push('still thinking')).toEqual([])
    expect(stream.push('</think>answer')).toEqual([
      { type: 'reasoning', text: 'still thinking' },
      { type: 'text', text: 'answer' },
    ])
  })

  it('closes the implicit block only once; later markers are stripped', () => {
    const out = run(['think</think>answer</think>tail'], { implicitOpen: true })
    expect(out).toEqual([
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'answertail' },
    ])
  })

  it('releases the head as text when no marker ever arrives', () => {
    // The lossless guarantee: a wrong guess delays the answer, never hides it.
    const out = run(['A plain answer with no tags at all.'], {
      implicitOpen: true,
    })
    expect(out).toEqual([
      { type: 'text', text: 'A plain answer with no tags at all.' },
    ])
  })

  it('gives up past the budget and streams the rest as text', () => {
    const stream = new ThinkTagStream({ implicitOpen: true })
    const long = 'x'.repeat(IMPLICIT_OPEN_BUDGET_CHARS)
    expect(stream.push(long)).toEqual([{ type: 'text', text: long }])
    expect(stream.push(' and more')).toEqual([
      { type: 'text', text: ' and more' },
    ])
    // Disarmed: a later marker is stripped, not treated as a close.
    expect(stream.push('</think>tail')).toEqual([{ type: 'text', text: 'tail' }])
  })

  it('disarms on a native reasoning chunk and releases the head as text', () => {
    const stream = new ThinkTagStream({ implicitOpen: true })
    expect(stream.push('the answer begins')).toEqual([])
    expect(stream.disarmImplicitOpen()).toEqual([
      { type: 'text', text: 'the answer begins' },
    ])
    expect(stream.push(' and continues')).toEqual([
      { type: 'text', text: ' and continues' },
    ])
  })

  it('still honours an explicit open tag while armed', () => {
    const out = run(['<think>explicit</think>answer'], { implicitOpen: true })
    expect(out).toEqual([
      { type: 'reasoning', text: 'explicit' },
      { type: 'text', text: 'answer' },
    ])
  })
})

describe('historyLeaksThinkTags', () => {
  const assistant = (text: string) => ({
    role: 'assistant',
    content: [{ type: 'text', text }],
  })

  it('is false for a clean history', () => {
    expect(historyLeaksThinkTags([])).toBe(false)
    expect(historyLeaksThinkTags([assistant('a normal answer')])).toBe(false)
  })

  it('is false when every block is properly paired', () => {
    expect(historyLeaksThinkTags([assistant('<think>x</think>answer')])).toBe(
      false,
    )
  })

  it('is true for an orphan close left in visible content', () => {
    expect(historyLeaksThinkTags([assistant('thought</think>answer')])).toBe(
      true,
    )
  })

  it('ignores user messages and non-text parts', () => {
    expect(
      historyLeaksThinkTags([
        { role: 'user', content: [{ type: 'text', text: 'why </think>?' }] },
        { role: 'assistant', content: [{ type: 'reasoning', text: '</think>' }] },
      ]),
    ).toBe(false)
  })
})

describe('stripThinkScaffolding', () => {
  it('removes paired blocks, unclosed opens and orphan closes', () => {
    expect(stripThinkScaffolding('<think>x</think>answer')).toBe('answer')
    expect(stripThinkScaffolding('answer<think>truncated')).toBe('answer')
    expect(stripThinkScaffolding('thought</think>answer')).toBe('thoughtanswer')
  })

  it('leaves surrounding whitespace alone, unlike stripThinkTags', () => {
    expect(stripThinkScaffolding('  spaced  ')).toBe('  spaced  ')
    expect(stripThinkScaffolding('a\n\n<think>x</think>\n\nb')).toBe('a\n\n\n\nb')
  })
})

describe('historyLeaksThinkTags — head window', () => {
  it('ignores a marker quoted deep in a long reply', () => {
    // A bug report about think tags is not evidence that this lane leaks.
    const quoted =
      'x'.repeat(IMPLICIT_OPEN_BUDGET_CHARS + 100) +
      ' the model printed </think> as plain text'
    expect(
      historyLeaksThinkTags([
        { role: 'assistant', content: [{ type: 'text', text: quoted }] },
      ]),
    ).toBe(false)
  })
})
