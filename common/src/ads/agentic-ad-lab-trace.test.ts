import { describe, expect, test } from 'bun:test'

import {
  LAB_TRACE_OUTPUT_CHARS,
  labRunTraceEntries,
  labRunTraceMarkdown,
  type LabRunTrace,
} from './agentic-ad-lab-trace'

describe('labRunTraceEntries', () => {
  test('merges text, keeps tool calls and results in order, drops reasoning', () => {
    const entries = labRunTraceEntries([
      { kind: 'chunk', payload: 'Reading ' },
      { kind: 'chunk', payload: 'the app.' },
      { kind: 'chunk', payload: { type: 'reasoning_chunk', chunk: 'hidden' } },
      {
        kind: 'event',
        payload: { type: 'tool_call', toolName: 'run', input: { cmd: 'ls' } },
      },
      {
        kind: 'event',
        payload: { type: 'tool_result', toolName: 'run', output: 'x'.repeat(5000) },
      },
      { kind: 'event', payload: { type: 'other' } },
      { kind: 'chunk', payload: '  ' },
    ])
    expect(entries.map((e) => e.kind)).toEqual(['text', 'tool', 'result'])
    expect(entries[0]).toEqual({ kind: 'text', text: 'Reading the app.' })
    expect(entries[1]).toEqual({
      kind: 'tool',
      name: 'run',
      input: '{\n  "cmd": "ls"\n}',
    })
    const result = entries[2] as { name: string; output: string }
    expect(result.name).toBe('run')
    expect(result.output.startsWith('x'.repeat(LAB_TRACE_OUTPUT_CHARS))).toBe(
      true,
    )
    expect(result.output).toEndWith('… (1000 more)')
  })
})

test('the Markdown trace never closes its own code block early', () => {
  const trace: LabRunTrace = {
    workspaceId: 'w1',
    slot: 2,
    repository: 'acme/app',
    runStatus: 'completed',
    error: null,
    signup: 'declined',
    grade: {
      tier: 'handoff',
      causeKey: 'signup_declined',
      cause: 'Stopped at sign-up.',
      stepsCompleted: 3,
      stepsTotal: 4,
      grader: 'model',
      rubricVersion: 'v',
    },
    entries: [
      { kind: 'text', text: 'Done.' },
      { kind: 'result', name: 'run', output: 'has ``` inside' },
    ],
    stepChecks: null,
    friction: ['npm was slow'],
    truncated: false,
  }
  const md = labRunTraceMarkdown(trace, { name: 'B', adName: 'Ad' })
  expect(md).toContain('# Run 3: acme/app')
  expect(md).toContain('- Result: handoff · signup_declined · step 3/4')
  expect(md).toContain('- npm was slow')
  expect(md).toContain('Result of run:\n\n````\nhas ``` inside\n````')
})
