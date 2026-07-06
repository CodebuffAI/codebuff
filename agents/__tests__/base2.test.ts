import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from '../base2/base2'
import codeReviewerLite from '../reviewer/code-reviewer-lite'

describe('base2 reviewer selection', () => {
  test('Codebuff lite uses MiniMax M3 and its matching reviewer', () => {
    const base2 = createBase2('lite')

    expect(base2.model).toBe(FREEBUFF_MINIMAX_M3_MODEL_ID)
    expect(base2.spawnableAgents).toContain('code-reviewer-minimax-m3')
    expect(base2.instructionsPrompt).toContain(
      'Spawn a code-reviewer-minimax-m3',
    )
    expect(base2.stepPrompt).toContain('spawn a code-reviewer-minimax-m3')
  })

  test('legacy lite reviewer definition uses DeepSeek V4 Flash', () => {
    expect(codeReviewerLite.model).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test.each([
    [FREEBUFF_MINIMAX_M3_MODEL_ID, 'code-reviewer-minimax-m3'],
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
    options?: Parameters<typeof createBase2>[1],
    params?: Record<string, unknown>,
  ) => {
    const base2 = createBase2(mode, options)
    const generator = base2.handleSteps!({ params } as any)
    const step = generator.next().value as any
    return step.input.params
  }

  const getSerializedContextPrunerParams = (
    mode: Parameters<typeof createBase2>[0],
    options?: Parameters<typeof createBase2>[1],
  ) => {
    const base2 = createBase2(mode, options)
    const handleStepsString = base2.handleSteps!.toString()
    expect(handleStepsString).toMatch(/^function\*\s*\(/)
    const isolatedHandleSteps = new Function(
      `return (${handleStepsString})`,
    )() as NonNullable<typeof base2.handleSteps>
    const generator = isolatedHandleSteps({ params: undefined } as any)
    const step = generator.next().value as any
    return step.input.params
  }

  test('free mode (MiniMax M3) defaults context pruning to 400k tokens', () => {
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

  test('free Kimi mode defaults context pruning to 250k tokens', () => {
    expect(
      getContextPrunerParams('free', { model: FREEBUFF_KIMI_MODEL_ID }),
    ).toEqual({
      maxContextLength: 250_000,
      cacheExpiryMs: 30 * 60 * 1000,
    })
  })

  test('free non-MiniMax/Kimi models default context pruning to 400k tokens', () => {
    expect(
      getContextPrunerParams('free', {
        model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toEqual({
      maxContextLength: 400_000,
      cacheExpiryMs: 30 * 60 * 1000,
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

  test.each([
    [FREEBUFF_KIMI_MODEL_ID, 250_000],
    [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, 400_000],
  ] as const)(
    'non-free model %p defaults context pruning to %p tokens',
    (model, maxContextLength) => {
      expect(getContextPrunerParams('default', { model })).toEqual({
        maxContextLength,
      })
    },
  )

  test.each([
    ['free', { model: FREEBUFF_KIMI_MODEL_ID }, 250_000],
    ['free', { model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID }, 400_000],
    ['default', { model: FREEBUFF_KIMI_MODEL_ID }, 250_000],
    ['default', { model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID }, 400_000],
  ] as const)(
    'serialized %s handleSteps for model %p defaults to %p tokens',
    (mode, options, maxContextLength) => {
      expect(getSerializedContextPrunerParams(mode, options)).toMatchObject({
        maxContextLength,
      })
    },
  )

  test('non-free mode preserves explicit context pruning params', () => {
    expect(
      getContextPrunerParams(
        'default',
        {
          model: FREEBUFF_KIMI_MODEL_ID,
        },
        {
          maxContextLength: 123_000,
          assistantToolBudget: 10_000,
        },
      ),
    ).toEqual({
      maxContextLength: 123_000,
      assistantToolBudget: 10_000,
    })
  })
})
