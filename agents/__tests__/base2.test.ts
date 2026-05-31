import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from '../base2/base2'

describe('base2 reviewer selection', () => {
  test.each([
    [FREEBUFF_MINIMAX_MODEL_ID, 'code-reviewer-minimax'],
    [FREEBUFF_KIMI_MODEL_ID, 'code-reviewer-kimi'],
    [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID, 'code-reviewer-deepseek'],
    [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID, 'code-reviewer-deepseek-flash'],
  ])('uses matching reviewer for model %p', (model, expectedReviewer) => {
    const base2 = createBase2('free', { model })

    expect(base2.spawnableAgents).toContain(expectedReviewer)
    expect(base2.instructionsPrompt).toContain(`Spawn a ${expectedReviewer}`)
    expect(base2.stepPrompt).toContain(`spawn a ${expectedReviewer}`)
  })
})

describe('base2 validation/reviewer coordination prompts', () => {
  test('requires joining parallel validation and review before finalizing', () => {
    const base2 = createBase2('default')

    expect(base2.systemPrompt).toContain('Validation/review join discipline')
    expect(base2.systemPrompt).toContain(
      'Do not treat parallel reviewer approval as final approval until validation has completed',
    )
    expect(base2.systemPrompt).toContain(
      'validation failure/timeout blocks completion even if review looks good',
    )
    expect(base2.instructionsPrompt).toContain('static code review only')
    expect(base2.stepPrompt).toContain('wait for both results before finalizing')
  })
})
