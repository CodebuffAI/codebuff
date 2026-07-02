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
      { type: 'finish' },
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

  it('appends a notice as its own part and closes open reasoning', () => {
    const parts = fold([
      { type: 'reasoning_delta', text: 'connecting' },
      { type: 'notice', notice: 'claude-code-auth', text: 'Claude Code is signed out.' },
      { type: 'finish' },
    ])
    expect(parts).toEqual([
      { kind: 'reasoning', id: 'p1', text: 'connecting', open: false, collapse: 'preview' },
      { kind: 'notice', id: 'p2', notice: 'claude-code-auth', text: 'Claude Code is signed out.' },
    ])
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

describe('foldAgentEvent — subagents', () => {
  it('renders a spawned subagent as an agent part and routes its events into it', () => {
    const parts = fold([
      { type: 'text', text: 'Let me look.' },
      {
        type: 'subagent_start',
        agentId: 'sub-1',
        agentType: 'file-picker',
        displayName: 'Fletcher the File Fetcher',
        parentAgentId: 'root',
        prompt: 'find the auth code',
      },
      { type: 'reasoning_delta', text: 'scanning', agentId: 'sub-1' },
      { type: 'text', text: 'auth.ts is relevant', agentId: 'sub-1' },
      { type: 'subagent_finish', agentId: 'sub-1' },
      { type: 'text', text: 'Got it.' },
      { type: 'finish' },
    ])
    expect(parts.map((p) => p.kind)).toEqual(['text', 'agent', 'text'])
    const agent = parts[1] as Extract<Part, { kind: 'agent' }>
    expect(agent).toMatchObject({
      kind: 'agent',
      id: 'sub-1',
      agentType: 'file-picker',
      displayName: 'Fletcher the File Fetcher',
      prompt: 'find the auth code',
      status: 'done',
    })
    expect(agent.blocks.map((b) => b.kind)).toEqual(['reasoning', 'text'])
    expect((agent.blocks[1] as Extract<Part, { kind: 'text' }>).text).toBe('auth.ts is relevant')
    // The subagent's reasoning closed at finish.
    expect((agent.blocks[0] as Extract<Part, { kind: 'reasoning' }>).open).toBe(false)
  })

  it('nests a subagent spawned by another subagent (file-picker → file-lister)', () => {
    const parts = fold([
      {
        type: 'subagent_start',
        agentId: 'picker',
        agentType: 'file-picker',
        displayName: 'File Picker',
        parentAgentId: 'root',
      },
      {
        type: 'subagent_start',
        agentId: 'lister',
        agentType: 'file-lister',
        displayName: 'File Lister',
        parentAgentId: 'picker',
      },
      { type: 'text', text: 'src/a.ts', agentId: 'lister' },
      { type: 'subagent_finish', agentId: 'lister' },
      { type: 'subagent_finish', agentId: 'picker' },
    ])
    expect(parts).toHaveLength(1)
    const picker = parts[0] as Extract<Part, { kind: 'agent' }>
    expect(picker.id).toBe('picker')
    expect(picker.blocks).toHaveLength(1)
    const lister = picker.blocks[0] as Extract<Part, { kind: 'agent' }>
    expect(lister).toMatchObject({ kind: 'agent', id: 'lister', status: 'done' })
    expect((lister.blocks[0] as Extract<Part, { kind: 'text' }>).text).toBe('src/a.ts')
  })

  it('treats a tool_call whose agentId is unknown (the root) as a root part', () => {
    const parts = fold([
      { type: 'tool_call', toolName: 'str_replace', input: { path: 'a.ts' }, toolCallId: 'c1', agentId: 'freebuff-desktop-thread' },
    ])
    expect(parts).toEqual([{ kind: 'tool', id: 'c1', toolName: 'str_replace', input: { path: 'a.ts' } }])
  })

  it('persists and reloads the agent tree with subagents marked done', () => {
    const live = fold([
      {
        type: 'subagent_start',
        agentId: 'sub-1',
        agentType: 'basher',
        displayName: 'Basher',
        parentAgentId: 'root',
      },
      { type: 'reasoning_delta', text: 'running', agentId: 'sub-1' },
    ])
    // Still running before reload.
    expect((live[0] as Extract<Part, { kind: 'agent' }>).status).toBe('running')
    const reloaded = partsFromPersisted({ role: 'assistant', text: '', parts: live }, id)
    const agent = reloaded[0] as Extract<Part, { kind: 'agent' }>
    expect(agent.status).toBe('done')
    // Nested reasoning collapses to hidden on reload.
    expect(agent.blocks[0]).toMatchObject({ kind: 'reasoning', collapse: 'hidden' })
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
