import { describe, expect, it } from 'bun:test'

import { foldAgentEvent, partsFromPersisted, type Part } from './parts'

let n = 0
const id = () => `p${++n}`

function fold(events: { type: string; [k: string]: unknown }[]): Part[] {
  n = 0
  return events.reduce<Part[]>((parts, ev) => foldAgentEvent(parts, ev, id), [])
}

describe('foldAgentEvent', () => {
  it('coalesces consecutive text deltas into one part', () => {
    const parts = fold([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ])
    expect(parts).toEqual([{ kind: 'text', text: 'Hello world' }])
  })

  it('coalesces consecutive reasoning deltas into one open block', () => {
    const parts = fold([
      { type: 'reasoning_delta', text: 'think ' },
      { type: 'reasoning_delta', text: 'more' },
    ])
    expect(parts).toEqual([{ kind: 'reasoning', id: 'p1', text: 'think more', open: true, collapse: 'preview' }])
  })

  it('interleaves reasoning, text, and tools in stream order', () => {
    const parts = fold([
      { type: 'reasoning_delta', text: 'planning' },
      { type: 'text', text: 'Found a bug.' },
      { type: 'tool_call', toolName: 'read_files', input: { paths: ['a.ts'] }, toolCallId: 'c1' },
      { type: 'tool_call', toolName: 'str_replace', input: { path: 'a.ts' }, toolCallId: 'c2' },
      { type: 'text', text: 'Fixed it.' },
      { type: 'reasoning_delta', text: 'verifying' },
      { type: 'tool_call', toolName: 'run_terminal_command', input: { command: 'test' }, toolCallId: 'c3' },
      { type: 'finish', totalCost: 0.01 },
    ])
    expect(parts.map((p) => p.kind)).toEqual([
      'reasoning', // planning
      'text', // Found a bug.
      'tool', // read
      'tool', // edit
      'text', // Fixed it.
      'reasoning', // verifying
      'tool', // run
    ])
    // Reasoning closes when prose/tools/finish follow it.
    for (const p of parts) if (p.kind === 'reasoning') expect(p.open).toBe(false)
  })

  it('closes an open reasoning block when text or a tool arrives', () => {
    const afterText = fold([
      { type: 'reasoning_delta', text: 'x' },
      { type: 'text', text: 'y' },
    ])
    expect((afterText[0] as Extract<Part, { kind: 'reasoning' }>).open).toBe(false)

    const afterTool = fold([
      { type: 'reasoning_delta', text: 'x' },
      { type: 'tool_call', toolName: 't', input: {}, toolCallId: 'c1' },
    ])
    expect((afterTool[0] as Extract<Part, { kind: 'reasoning' }>).open).toBe(false)
  })

  it('ignores empty deltas (returns the same array reference)', () => {
    const parts: Part[] = [{ kind: 'text', text: 'hi' }]
    expect(foldAgentEvent(parts, { type: 'text', text: '' }, id)).toBe(parts)
    expect(foldAgentEvent(parts, { type: 'reasoning_delta', text: '' }, id)).toBe(parts)
  })

  it('starts a new text part after a tool (does not merge across the tool)', () => {
    const parts = fold([
      { type: 'text', text: 'before' },
      { type: 'tool_call', toolName: 't', input: {}, toolCallId: 'c1' },
      { type: 'text', text: 'after' },
    ])
    expect(parts).toEqual([
      { kind: 'text', text: 'before' },
      { kind: 'tool', id: 'c1', toolName: 't', input: {} },
      { kind: 'text', text: 'after' },
    ])
  })
})

describe('partsFromPersisted', () => {
  it('returns stored parts verbatim, with reasoning collapsed to hidden', () => {
    const stored: Part[] = [
      { kind: 'reasoning', id: 'r1', text: 'why', open: false, collapse: 'preview' },
      { kind: 'text', text: 'done' },
    ]
    const out = partsFromPersisted({ role: 'assistant', text: 'done', parts: stored }, id)
    expect(out[0]).toMatchObject({ kind: 'reasoning', collapse: 'hidden', userOpened: false })
    expect(out[1]).toEqual({ kind: 'text', text: 'done' })
  })

  it('falls back to text-then-tools for legacy messages (no parts)', () => {
    n = 0
    const out = partsFromPersisted(
      { role: 'assistant', text: 'hi', acts: [{ toolName: 'read_files', input: { paths: ['a'] } }] },
      id,
    )
    expect(out).toEqual([
      { kind: 'text', text: 'hi' },
      { kind: 'tool', id: 'p1', toolName: 'read_files', input: { paths: ['a'] } },
    ])
  })

  it('renders a user message as a single text part', () => {
    expect(partsFromPersisted({ role: 'user', text: 'hello' }, id)).toEqual([{ kind: 'text', text: 'hello' }])
  })
})
