import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { getStubProjectFileContext } from '@codebuff/common/util/file'
import { describe, expect, it } from 'bun:test'

import { cloneSessionState } from '../run'

import type { SessionState } from '@codebuff/common/types/session-state'

function makeSession(): SessionState {
  const state = getInitialSessionState(getStubProjectFileContext())
  state.mainAgentState.messageHistory = [
    { role: 'user', content: [{ type: 'text', text: 'hello' }] } as any,
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'world' }],
    } as any,
  ]
  return state
}

describe('cloneSessionState', () => {
  it('returns a structurally-equal copy', () => {
    const source = makeSession()
    const clone = cloneSessionState(source)
    expect(clone).toEqual(source)
  })

  it('is a deep copy: mutating the clone does not affect the source', () => {
    const source = makeSession()
    const clone = cloneSessionState(source)

    // Append to the clone's history (the actual use: pushing an interruption
    // message onto a snapshot).
    clone.mainAgentState.messageHistory.push({
      role: 'user',
      content: [{ type: 'text', text: 'interrupted' }],
    } as any)
    // Mutate a nested content block in the clone.
    ;(clone.mainAgentState.messageHistory[0] as any).content[0].text = 'changed'

    expect(source.mainAgentState.messageHistory).toHaveLength(2)
    expect(
      (source.mainAgentState.messageHistory[0] as any).content[0].text,
    ).toBe('hello')
  })

  it('deep-copies mainAgentState but shares fileContext by reference', () => {
    const source = makeSession()
    const clone = cloneSessionState(source)

    // mainAgentState (where in-place mutations happen) is an independent copy.
    expect(clone.mainAgentState).not.toBe(source.mainAgentState)
    expect(clone.mainAgentState.messageHistory).not.toBe(
      source.mainAgentState.messageHistory,
    )
    // fileContext is intentionally shared: it's large, effectively read-only
    // during a run, so copying it is wasted work.
    expect(clone.fileContext).toBe(source.fileContext)
  })

  it('shares fileContext even when it holds a non-JSON-cloneable value', () => {
    const source = makeSession()
    // MCP tools can place Zod schemas (with methods) in customToolDefinitions.
    // Sharing fileContext means this never affects the clone path.
    ;(source.fileContext as any).customToolDefinitions = {
      mcpTool: { inputSchema: { parse: () => ({}), _def: {} } },
    }

    const clone = cloneSessionState(source)

    expect(clone.mainAgentState).not.toBe(source.mainAgentState)
    expect(clone.fileContext).toBe(source.fileContext)
    expect((clone.fileContext as any).customToolDefinitions.mcpTool).toBe(
      (source.fileContext as any).customToolDefinitions.mcpTool,
    )
  })

  it('clones message content with URL / Buffer instances without throwing', () => {
    // The message schema permits URL and Buffer in image/file content.
    // structuredClone throws on URL; the JSON round-trip must not, and must
    // produce the same bytes the snapshot is ultimately persisted as.
    const source = makeSession()
    source.mainAgentState.messageHistory.push({
      role: 'user',
      content: [
        { type: 'image', image: new URL('https://example.com/a.png') },
        { type: 'file', data: Buffer.from('hello'), mediaType: 'text/plain' },
      ],
    } as any)

    const clone = cloneSessionState(source)

    // Independent copy, and byte-parity with JSON persistence of the source.
    expect(clone.mainAgentState).not.toBe(source.mainAgentState)
    expect(JSON.stringify(clone.mainAgentState)).toBe(
      JSON.stringify(source.mainAgentState),
    )
  })

  it('falls back to a deep copy when JSON.stringify throws (circular ref)', () => {
    const source = makeSession()
    // A circular reference makes JSON.stringify throw, forcing the cloneDeep
    // fallback (cloneDeep handles cycles) so a snapshot can never fail to build.
    const circular: any = { self: null }
    circular.self = circular
    ;(source.mainAgentState as any).output = circular

    const clone = cloneSessionState(source)

    expect(clone.mainAgentState).not.toBe(source.mainAgentState)
    expect(clone.mainAgentState.messageHistory).not.toBe(
      source.mainAgentState.messageHistory,
    )
    // Mutating the fallback clone must not affect the source either.
    clone.mainAgentState.messageHistory.push({
      role: 'user',
      content: [{ type: 'text', text: 'x' }],
    } as any)
    expect(source.mainAgentState.messageHistory).toHaveLength(2)
  })
})
