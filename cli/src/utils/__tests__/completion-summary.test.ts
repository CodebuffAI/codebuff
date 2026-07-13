import { describe, expect, test } from 'bun:test'

import {
  computeCompletionSummary,
  formatCompletionSummary,
  type CompletionSummary,
} from '../completion-summary'
import type { ContentBlock, ToolContentBlock } from '../../types/chat'

function makeEditBlock(
  overrides: Partial<ToolContentBlock> & {
    toolName?: ToolContentBlock['toolName']
  },
): ToolContentBlock {
  return {
    type: 'tool',
    toolCallId: overrides.toolCallId ?? 'call-1',
    toolName: overrides.toolName ?? 'str_replace',
    input: overrides.input ?? { path: '/a.ts' },
    output: overrides.output,
    outputRaw: overrides.outputRaw,
  }
}

describe('computeCompletionSummary', () => {
  test('[MUT-H04] proposal previews are never counted as edited files', () => {
    const summary = computeCompletionSummary([
      makeEditBlock({
        toolName: 'propose_str_replace',
        input: { path: '/a.ts' },
        outputRaw: [{ type: 'json', value: { unifiedDiff: '@@\n-old\n+new' } }],
      }),
    ])
    expect(summary?.filesEdited ?? 0).toBe(0)
  })

  test('[MUT-M05] unconfirmed canonical mutations are called out in summaries', () => {
    const summary = computeCompletionSummary([
      makeEditBlock({
        outputRaw: [
          {
            type: 'json',
            value: {
              kind: 'file_mutation_result',
              version: 1,
              operationId: 'op-1',
              outcome: 'unconfirmed',
              authorityTier: null,
              actions: [
                {
                  actionId: 'a',
                  index: 0,
                  action: 'update',
                  path: '/a.ts',
                  outcome: 'unconfirmed',
                  beforeHash: null,
                  afterHash: null,
                },
              ],
              errors: [],
              freshCapabilities: [],
            },
          },
        ],
      }),
    ])
    expect(summary?.filesEdited ?? 0).toBe(0)
    expect(summary?.filesFailed ?? 0).toBe(0)
    expect(summary?.filesUnconfirmed ?? 0).toBe(1)
  })

  test('returns null for empty blocks', () => {
    expect(computeCompletionSummary([])).toBeNull()
  })

  test('returns null when no recognizable activity is present', () => {
    const blocks: ContentBlock[] = [{ type: 'text', content: 'just a message' }]
    expect(computeCompletionSummary(blocks)).toBeNull()
  })

  test('counts a successful str_replace as a file edited', () => {
    const blocks: ContentBlock[] = [
      makeEditBlock({
        toolName: 'str_replace',
        input: { path: '/a.ts' },
        outputRaw: [
          {
            type: 'json',
            value: {
              message: 'String replace applied successfully.',
              unifiedDiff: '@@ -1,1 +1,1 @@\n-old\n+new',
            },
          },
        ],
      }),
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.filesEdited).toBe(1)
    expect(summary?.filesFailed).toBe(0)
  })

  test('counts an edit with no diff as a file failed', () => {
    const blocks: ContentBlock[] = [
      makeEditBlock({
        toolName: 'str_replace',
        input: { path: '/a.ts' },
        output: 'Error: oldString not found',
        outputRaw: [
          { type: 'json', value: { errorMessage: 'oldString not found' } },
        ],
      }),
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.filesFailed).toBe(1)
    expect(summary?.filesEdited).toBe(0)
  })

  test('deduplicates edits to the same file path', () => {
    const successValue = {
      message: 'String replace applied successfully.',
      unifiedDiff: '@@ -1,1 +1,1 @@\n-old\n+new',
    }
    const blocks: ContentBlock[] = [
      makeEditBlock({
        toolCallId: 'c1',
        input: { path: '/a.ts' },
        outputRaw: [{ type: 'json', value: successValue }],
      }),
      makeEditBlock({
        toolCallId: 'c2',
        input: { path: '/a.ts' },
        outputRaw: [{ type: 'json', value: successValue }],
      }),
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.filesEdited).toBe(1)
  })

  test('detects a review verdict from a set_output tool block', () => {
    const blocks: ContentBlock[] = [
      makeEditBlock({
        toolName: 'set_output',
        input: {},
        outputRaw: [
          { type: 'json', value: { value: 'LOOKS_GOOD: nice work' } },
        ],
      }),
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.reviewVerdict).toBe('LOOKS_GOOD')
  })

  test('detects a review verdict from a code-reviewer agent block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'a1',
        agentName: 'Reviewer',
        agentType: 'code-reviewer',
        content: 'BLOCKING: critical bug found',
        status: 'complete',
      },
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.reviewVerdict).toBe('BLOCKING')
  })

  test('counts test passes/fails from run_terminal_command output', () => {
    const blocks: ContentBlock[] = [
      makeEditBlock({
        toolName: 'run_terminal_command',
        input: {},
        outputRaw: [{ type: 'json', value: '12 passed\n3 failed' }],
      }),
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.testPassed).toBe(12)
    expect(summary?.testFailed).toBe(3)
  })

  test('counts file-change hook outcomes', () => {
    const summary = computeCompletionSummary([
      {
        type: 'tool',
        toolName: 'run_file_change_hooks',
        toolCallId: 'hooks',
        input: { files: ['a.ts'] },
        outputRaw: [
          {
            type: 'json',
            value: [
              { hookName: 'typecheck', exitCode: 0 },
              { hookName: 'lint', exitCode: 1, stderr: 'failed' },
            ],
          },
        ],
      },
    ])
    expect(summary).toMatchObject({ hooksPassed: 1, hooksFailed: 1 })
  })

  test('counts errors from tool blocks with error outputRaw', () => {
    const blocks: ContentBlock[] = [
      makeEditBlock({
        toolName: 'run_terminal_command',
        input: {},
        outputRaw: [{ type: 'json', value: { error: 'boom' } }],
      }),
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.errors).toBeGreaterThanOrEqual(1)
  })

  test('counts errors from a failed agent block', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'agent',
        agentId: 'a1',
        agentName: 'Editor',
        agentType: 'editor',
        content: '',
        status: 'failed',
      },
    ]
    const summary = computeCompletionSummary(blocks)
    expect(summary?.errors).toBe(1)
  })

  test('does not count an edit failure again as a generic error', () => {
    const summary = computeCompletionSummary([
      makeEditBlock({
        outputRaw: [
          { type: 'json', value: { errorMessage: 'oldString not found' } },
        ],
      }),
    ])
    expect(summary).toMatchObject({ filesFailed: 1, errors: 0 })
  })

  test('does not double-count a failed agent and its nested tool error', () => {
    const summary = computeCompletionSummary([
      {
        type: 'agent',
        agentId: 'a1',
        agentName: 'Editor',
        agentType: 'editor',
        content: '',
        status: 'failed',
        blocks: [
          makeEditBlock({
            toolName: 'run_terminal_command',
            outputRaw: [{ type: 'json', value: { errorMessage: 'boom' } }],
          }),
        ],
      },
    ])
    expect(summary?.errors).toBe(1)
  })

  test('does not report recovered nested tool errors after an agent completes', () => {
    const summary = computeCompletionSummary([
      {
        type: 'agent',
        agentId: 'a1',
        agentName: 'Editor',
        agentType: 'editor',
        content: 'Recovered and completed.',
        status: 'complete',
        blocks: [
          makeEditBlock({
            toolName: 'run_terminal_command',
            outputRaw: [
              { type: 'json', value: { errorMessage: 'transient failure' } },
            ],
          }),
        ],
      },
    ])
    expect(summary?.errors ?? 0).toBe(0)
  })

  test('does not repeat an auxiliary failure in the generic error count', () => {
    const summary = computeCompletionSummary([
      {
        type: 'agent',
        agentId: 'a1',
        agentName: 'Security Reviewer',
        agentType: 'security-reviewer',
        content: '',
        status: 'failed',
      },
    ])
    expect(summary).toMatchObject({ auxiliaryFailed: 1, errors: 0 })
  })
})

describe('formatCompletionSummary', () => {
  function makeSummary(
    overrides: Partial<CompletionSummary>,
  ): CompletionSummary {
    return {
      filesEdited: 0,
      filesFailed: 0,
      filesUnconfirmed: 0,
      filesRolledBack: 0,
      rollbackIncomplete: 0,
      reviewVerdict: null,
      testPassed: 0,
      testFailed: 0,
      hooksPassed: 0,
      hooksFailed: 0,
      hooksSkipped: 0,
      auxiliaryCompleted: 0,
      auxiliaryFailed: 0,
      errors: 0,
      ...overrides,
    }
  }

  test('renders a single edited file with green check', () => {
    expect(formatCompletionSummary(makeSummary({ filesEdited: 1 }))).toBe(
      '✅ 1 file edited',
    )
  })

  test('renders multiple edited files with pluralization', () => {
    expect(formatCompletionSummary(makeSummary({ filesEdited: 3 }))).toBe(
      '✅ 3 files edited',
    )
  })

  test('renders a failed edit with warning emoji', () => {
    expect(
      formatCompletionSummary(makeSummary({ filesEdited: 2, filesFailed: 1 })),
    ).toBe('⚠️ 2 files edited, 1 failed')
  })

  test('renders a green review verdict', () => {
    expect(
      formatCompletionSummary(makeSummary({ reviewVerdict: 'LOOKS_GOOD' })),
    ).toBe('Reviewed: 🟢 LOOKS_GOOD')
  })

  test('renders a blocking review verdict as red', () => {
    expect(
      formatCompletionSummary(makeSummary({ reviewVerdict: 'BLOCKING' })),
    ).toBe('Reviewed: 🔴 BLOCKING')
  })

  test('renders a non-blocking review verdict as yellow', () => {
    expect(
      formatCompletionSummary(makeSummary({ reviewVerdict: 'NON_BLOCKING' })),
    ).toBe('Reviewed: 🟡 NON_BLOCKING')
  })

  test('renders passing tests with green check', () => {
    expect(formatCompletionSummary(makeSummary({ testPassed: 5 }))).toBe(
      '✅ Tests: 5 passed',
    )
  })

  test('renders failing tests with red cross', () => {
    expect(
      formatCompletionSummary(makeSummary({ testPassed: 5, testFailed: 1 })),
    ).toBe('❌ Tests: 5 passed, 1 failed')
  })

  test('renders errors with red cross and pluralization', () => {
    expect(formatCompletionSummary(makeSummary({ errors: 2 }))).toBe(
      '❌ 2 errors',
    )
  })

  test('joins multiple sections with " | "', () => {
    expect(
      formatCompletionSummary(
        makeSummary({ filesEdited: 1, testPassed: 3, errors: 1 }),
      ),
    ).toBe('✅ 1 file edited | ✅ Tests: 3 passed | ❌ 1 error')
  })
})
