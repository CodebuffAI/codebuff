import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from '../base2/base2'
import codeReviewerLite from '../reviewer/code-reviewer-lite'

describe('base2 reviewer selection', () => {
  test('Codebuff lite uses DeepSeek V4 Flash and its matching reviewer', () => {
    const base2 = createBase2('lite')

    expect(base2.model).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(base2.spawnableAgents).toContain('code-reviewer-deepseek-flash')
    expect(base2.instructionsPrompt).toContain(
      'Spawn a code-reviewer-deepseek-flash',
    )
    expect(base2.stepPrompt).toContain('spawn a code-reviewer-deepseek-flash')
  })

  test('legacy lite reviewer definition uses DeepSeek V4 Flash', () => {
    expect(codeReviewerLite.model).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test.each([
    [FREEBUFF_MINIMAX_MODEL_ID, 'code-reviewer-minimax'],
    [FREEBUFF_KIMI_MODEL_ID, 'code-reviewer-kimi'],
    [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, 'code-reviewer-deepseek'],
    [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID, 'code-reviewer-deepseek-flash'],
    [FREEBUFF_MIMO_V25_PRO_MODEL_ID, 'code-reviewer-mimo-pro'],
    [FREEBUFF_MIMO_V25_MODEL_ID, 'code-reviewer-mimo'],
  ])('uses matching reviewer for model %p', (model, expectedReviewer) => {
    const base2 = createBase2('free', { model })

    expect(base2.spawnableAgents).toContain(expectedReviewer)
    expect(base2.instructionsPrompt).toContain(`Spawn a ${expectedReviewer}`)
    expect(base2.stepPrompt).toContain(`spawn a ${expectedReviewer}`)
  })
})

describe('base2 context pruning', () => {
  const getContextPrunerParams = (
    mode: Parameters<typeof createBase2>[0],
    params?: Record<string, unknown>,
  ) => {
    const base2 = createBase2(mode)
    const generator = base2.handleSteps!({ params } as any)
    const step = generator.next().value as any
    return step.input.params
  }

  test('free mode defaults context pruning to 400k tokens', () => {
    const base2 = createBase2('free')
    const generator = base2.handleSteps!({ params: undefined } as any)

    expect(generator.next().value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
        params: {
          maxContextLength: 400_000,
          cacheExpiryMs: 30 * 60 * 1000,
        },
      },
      includeToolCall: false,
    })
  })

  test('free mode preserves explicit context pruning params', () => {
    const base2 = createBase2('free')
    const generator = base2.handleSteps!({
      params: { maxContextLength: 123_000, assistantToolBudget: 10_000 },
    } as any)

    expect(generator.next().value).toMatchObject({
      input: {
        params: {
          maxContextLength: 123_000,
          assistantToolBudget: 10_000,
          cacheExpiryMs: 30 * 60 * 1000,
        },
      },
    })
  })

  test.each(['default', 'lite', 'max', 'fast'] as const)(
    '%s mode defaults context pruning to 400k tokens without a cache expiry override',
    (mode) => {
      expect(getContextPrunerParams(mode)).toEqual({
        maxContextLength: 400_000,
      })
    },
  )

  test('non-free mode preserves explicit context pruning params', () => {
    expect(
      getContextPrunerParams('default', {
        maxContextLength: 123_000,
        assistantToolBudget: 10_000,
      }),
    ).toEqual({
      maxContextLength: 123_000,
      assistantToolBudget: 10_000,
    })
  })
})
