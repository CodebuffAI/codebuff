import { expect, test } from 'bun:test'
import { DEEPSEEK_FLASH_COMPACTION_POLICY } from '@codebuff/common/constants/compaction-policy'

import {
  automaticCompactionIsWorthwhile,
  automaticCompactionPostCeiling,
  compactedContextCeiling,
  compactMechanically,
} from '../compaction'
import { evaluateCompactionTrigger } from '../compact-history'
import { countTokensMessages } from '../util/token-counter'

import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'

const user = (text: string): Message => ({
  role: 'user',
  tags: ['USER_PROMPT'],
  content: [{ type: 'text', text }],
})
const messages: Message[] = [
  user('Compare the time units in a.ts and b.ts.'),
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'a',
        toolName: 'read_files',
        input: { paths: ['a.ts'] },
      },
    ],
  },
  {
    role: 'tool',
    toolName: 'read_files',
    toolCallId: 'a',
    content: [
      {
        type: 'json',
        value: [
          {
            path: 'a.ts',
            content:
              'A_EXPECTS_MILLISECONDS\n' +
              'const timeoutMs = 5000;\n'.repeat(200),
          },
        ],
      },
    ],
  },
  {
    role: 'assistant',
    content: [{ type: 'text', text: 'Next inspect b.ts.' }],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'b',
        toolName: 'read_files',
        input: { paths: ['b.ts'] },
      },
    ],
  },
  {
    role: 'tool',
    toolName: 'read_files',
    toolCallId: 'b',
    content: [
      {
        type: 'json',
        value: [
          {
            path: 'b.ts',
            content:
              'B_PRODUCES_SECONDS\n' +
              'const timeoutSeconds = 5;\n'.repeat(200),
          },
        ],
      },
    ],
  },
]
const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

test('a compaction on a resumed tool exchange consumes the old idle gap', () => {
  const now = Date.now()
  const yesterday = now - 24 * 60 * 60 * 1000
  const history: Message[] = messages.map((message) =>
    message.role === 'tool' ? structuredClone(message) : { ...message, sentAt: yesterday },
  )
  history[2] = {
    role: 'tool',
    toolName: 'read_files',
    toolCallId: 'a',
    content: [{ type: 'json', value: [{ path: 'a.ts', content: 'old code\n'.repeat(30_000) }] }],
  }
  history.push({ ...user('Investigate the failed CI run.'), sentAt: now })
  const original = structuredClone(history)
  const fixedTokenCount = 15_000
  const trigger = (messages: Message[], contextTokenCount = countTokensMessages(messages) + fixedTokenCount) =>
    evaluateCompactionTrigger({
      ...DEEPSEEK_FLASH_COMPACTION_POLICY,
      messages,
      contextTokenCount,
      maxContextLength: 320_000,
    }).trigger
  expect(trigger(history)).toBe('cache_expiry')

  const result = compactMechanically({
    messages: history,
    maxContextLength: 400_000,
    fixedTokenCount,
    targetTokens: 272_000,
    logger: noopLogger,
  })
  expect(result!.postTokens).toBeLessThan(40_000)
  expect(history).toEqual(original)
  const withoutTimestamp = (messages: Message[]) => messages.map(({ sentAt, ...message }) => message)
  expect(withoutTimestamp(result!.messages.slice(-3))).toEqual(withoutTimestamp(history.slice(-3)))

  const resumedAt = Date.now()
  const continued: Message[] = [
    ...result!.messages,
    { role: 'assistant', sentAt: resumedAt, content: [{ type: 'tool-call', toolName: 'run_terminal_command', toolCallId: 'next', input: { command: 'git status' } }] },
    { role: 'tool', toolName: 'run_terminal_command', toolCallId: 'next', content: [{ type: 'json', value: { stdout: 'command output '.repeat(5_000) } }] },
  ]
  expect(countTokensMessages(continued) + fixedTokenCount).toBeGreaterThan(40_000)
  expect(trigger(continued)).toBeNull()
  expect(trigger(continued, 320_001)).toBe('context_limit')
  expect(trigger([
    ...continued,
    { ...user('Continue after another break.'), sentAt: resumedAt + 16 * 60 * 1000 },
  ])).toBe('cache_expiry')
})

test('an automatic compaction that cannot clear its own threshold is not worthwhile', () => {
  const byokDefault = { maxContextLength: 25_804, thresholdTokens: 20_643 }
  expect(
    automaticCompactionIsWorthwhile({ messages, ...byokDefault, fixedTokenCount: 16_000 }),
  ).toBe(false)
  expect(
    automaticCompactionIsWorthwhile({ messages, ...byokDefault, fixedTokenCount: 3_000 }),
  ).toBe(true)
  expect(
    automaticCompactionIsWorthwhile({
      messages,
      maxContextLength: 400_000,
      thresholdTokens: 320_000,
      fixedTokenCount: 20_000,
    }),
  ).toBe(true)
  const ceiling = compactedContextCeiling({ messages, maxContextLength: 400_000, fixedTokenCount: 20_000 })
  expect(ceiling).toBe(20_000 + countTokensMessages([messages[0]]) + 6_000)
  expect(
    compactedContextCeiling({ messages, maxContextLength: 400_000, fixedTokenCount: 20_000, maxOutputTokens: 4_096 }),
  ).toBe(20_000 + countTokensMessages([messages[0]]) + 2_048)
})

test('an automatic compaction aims below the trigger instead of refilling the whole budget', () => {
  const params = {
    messages,
    maxContextLength: 16_384,
    fixedTokenCount: 500,
    logger: noopLogger,
  }
  expect(compactMechanically(params)).toBeNull()
  const roomy = compactMechanically({ ...params, targetTokens: 4_000 })
  const aimed = compactMechanically({ ...params, targetTokens: 1_500 })
  expect(roomy!.postTokens).toBeLessThanOrEqual(4_000)
  expect(aimed!.postTokens).toBeLessThanOrEqual(roomy!.postTokens)
  const bResult = JSON.stringify((messages[5] as ToolMessage).content)
  for (const result of [roomy, aimed]) {
    const sent = JSON.stringify(result!.messages)
    expect(sent).toContain('Compare the time units in a.ts and b.ts.')
    expect(sent).toContain(bResult)
  }
})

test('compactMechanically logs each compaction it does not apply', () => {
  const infos: unknown[] = []
  const warnings: unknown[] = []
  const logger = {
    ...noopLogger,
    info: (data: unknown) => infos.push(data),
    warn: (data: unknown) => warnings.push(data),
  }
  const common = {
    fixedTokenCount: 500,
    trigger: 'context_limit' as const,
    logger,
    runId: 'run-1',
    model: 'deepseek/deepseek-v4-flash',
    contextTokenCount: 9_000,
  }

  expect(
    compactMechanically({
      ...common,
      messages: [user('Only the live request.')],
      maxContextLength: 400_000,
    }),
  ).toBeNull()
  expect(infos).toEqual([
    {
      axiomEvent: 'mechanical_compaction.skipped',
      agent_run_id: 'run-1',
      model: 'deepseek/deepseek-v4-flash',
      trigger_reason: 'context_limit',
      error_kind: 'no_shrink',
      context_token_count: 9_000,
      max_context_length: 400_000,
    },
  ])

  expect(
    compactMechanically({
      ...common,
      messages: [user('too long '.repeat(5_000))],
      maxContextLength: 2_000,
    }),
  ).toBeNull()
  expect(warnings).toEqual([
    expect.objectContaining({
      axiomEvent: 'mechanical_compaction.skipped',
      error_kind: 'over_budget',
      error_name: 'Error',
    }),
  ])

  infos.length = 0
  warnings.length = 0
  const result = compactMechanically({
    ...common,
    messages,
    maxContextLength: 16_384,
    targetTokens: 4_000,
  })
  expect(result!.postTokens).toBeLessThan(result!.preTokens)
  expect(warnings).toEqual([])
  expect(infos).toEqual([
    expect.objectContaining({ axiomEvent: 'context_compaction_completed' }),
  ])
})

/**
 * The lean 110k budget (Gemini 4 Argon, Claude Haiku 5.5's 100k row) with one
 * large fresh tool result: the shape behind the runs that compacted ten times
 * or more in production. The pass keeps the fresh exchange whole, so it lands
 * back at the threshold that fired it and the next read fires the next pass.
 */
const leanBudget = {
  maxContextLength: 110_000,
  thresholdTokens: 88_000,
  fixedTokenCount: 15_000,
}
const bigReadHistory = (freshLines: number, olderLines: number): Message[] => [
  user('Why does the importer drop rows?'),
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'older',
        toolName: 'read_files',
        input: { paths: ['importer.ts'] },
      },
    ],
  },
  {
    role: 'tool',
    toolName: 'read_files',
    toolCallId: 'older',
    content: [
      {
        type: 'json',
        value: [
          {
            path: 'importer.ts',
            content: 'const parsed = parseRow(line);\n'.repeat(olderLines),
          },
        ],
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'fresh',
        toolName: 'read_files',
        input: { paths: ['rows.ts'] },
      },
    ],
  },
  {
    role: 'tool',
    toolName: 'read_files',
    toolCallId: 'fresh',
    content: [
      {
        type: 'json',
        value: [
          {
            path: 'rows.ts',
            content: 'export const row = { id: 1, name: "a" };\n'.repeat(
              freshLines,
            ),
          },
        ],
      },
    ],
  },
]

test('the pre-check misses what a pass keeps whole, so the result is checked too', () => {
  // ~70k tokens of fresh read (41 chars a line, 3 chars a token) over ~10k
  // of older read, so the pass can shrink the history but not the part it
  // keeps whole.
  const history = bigReadHistory(5_122, 968)
  const contextTokenCount =
    countTokensMessages(history) + leanBudget.fixedTokenCount
  // The deferral window: past the threshold, under the hard budget. Both
  // bounds are the fixture's preconditions, not the behaviour under test.
  expect(contextTokenCount).toBeGreaterThan(leanBudget.thresholdTokens)
  expect(contextTokenCount).toBeLessThanOrEqual(leanBudget.maxContextLength)

  // What main does: the pre-check sees a fixed prefix, the live request and a
  // 6k summary, says there is room, and the pass applies — landing above the
  // low-water mark, where the next tool result triggers the next pass.
  expect(automaticCompactionIsWorthwhile({ ...leanBudget, messages: history })).toBe(
    true,
  )
  const pass = {
    messages: history,
    maxContextLength: leanBudget.maxContextLength,
    fixedTokenCount: leanBudget.fixedTokenCount,
    targetTokens: 44_000,
    logger: noopLogger,
  }
  const applied = compactMechanically(pass)
  expect(applied!.postTokens).toBeLessThan(applied!.preTokens)
  const ceiling = automaticCompactionPostCeiling(leanBudget.thresholdTokens)
  expect(ceiling).toBe(74_800)
  expect(applied!.postTokens).toBeGreaterThan(ceiling)

  const infos: any[] = []
  const original = structuredClone(history)
  expect(
    compactMechanically({
      ...pass,
      maxPostTokens: ceiling,
      trigger: 'context_limit',
      runId: 'run-lean',
      model: 'gemini-4-argon',
      contextTokenCount,
      logger: { ...noopLogger, info: (data: unknown) => infos.push(data) },
    }),
  ).toBeNull()
  expect(history).toEqual(original)
  expect(infos).toEqual([
    {
      axiomEvent: 'mechanical_compaction.skipped',
      agent_run_id: 'run-lean',
      model: 'gemini-4-argon',
      trigger_reason: 'context_limit',
      error_kind: 'above_low_water',
      post_tokens: applied!.postTokens,
      context_token_count: contextTokenCount,
      max_context_length: leanBudget.maxContextLength,
    },
  ])
})

test('a pass that clears the low-water mark still applies', () => {
  // The same history with a fresh result the pass can work around: it lands
  // under the ceiling, so nothing is abandoned.
  const history = bigReadHistory(600, 5_000)
  const ceiling = automaticCompactionPostCeiling(leanBudget.thresholdTokens)
  const applied = compactMechanically({
    messages: history,
    maxContextLength: leanBudget.maxContextLength,
    fixedTokenCount: leanBudget.fixedTokenCount,
    targetTokens: 44_000,
    maxPostTokens: ceiling,
    logger: noopLogger,
  })
  expect(applied!.postTokens).toBeLessThanOrEqual(ceiling)
  expect(applied!.postTokens).toBeLessThan(applied!.preTokens)
  // The fresh read the model has not acted on yet is still there whole.
  expect(JSON.stringify(applied!.messages)).toContain(
    'export const row = { id: 1,',
  )
})
