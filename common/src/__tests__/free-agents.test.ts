import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
} from '../constants/freebuff-models'
import { FREEBUFF_GEMINI_THINKER_AGENT_ID } from '../constants/freebuff-gemini-thinker'
import {
  getFreebuffRootAgentIdForModel,
  isFreebuffGeminiThinkerAgent,
  isFreeModeAllowedAgentModel,
} from '../constants/free-agents'

describe('free mode agent model allowlist', () => {
  test('maps selectable freebuff models to concrete root agents', () => {
    expect(getFreebuffRootAgentIdForModel(FREEBUFF_MINIMAX_MODEL_ID)).toBe(
      'base2-free',
    )
    expect(getFreebuffRootAgentIdForModel(FREEBUFF_KIMI_MODEL_ID)).toBe(
      'base2-free-kimi',
    )
    expect(
      getFreebuffRootAgentIdForModel(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe('base2-free-deepseek')
  })

  test('allows each freebuff root agent only with its configured model', () => {
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREEBUFF_MINIMAX_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free',
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREEBUFF_KIMI_MODEL_ID),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel('base2-free-kimi', FREEBUFF_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-deepseek',
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('allows each freebuff reviewer agent only with its configured model', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax',
        FREEBUFF_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax',
        FREEBUFF_KIMI_MODEL_ID,
      ),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-kimi', FREEBUFF_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-deepseek',
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('allows legacy code-reviewer-lite with freebuff reviewer models', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        FREEBUFF_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-lite', FREEBUFF_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('allows the browser-use subagent with its bundled model', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'browser-use',
        'google/gemini-3.1-flash-lite-preview',
      ),
    ).toBe(true)
  })

  test('allows Gemini Pro for the thinker subagent but not the freebuff root', () => {
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREEBUFF_GEMINI_PRO_MODEL_ID),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel(
        FREEBUFF_GEMINI_THINKER_AGENT_ID,
        FREEBUFF_GEMINI_PRO_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('recognizes the Gemini thinker agent in free mode', () => {
    expect(isFreebuffGeminiThinkerAgent(FREEBUFF_GEMINI_THINKER_AGENT_ID)).toBe(
      true,
    )
    expect(
      isFreebuffGeminiThinkerAgent(
        `codebuff/${FREEBUFF_GEMINI_THINKER_AGENT_ID}@0.0.1`,
      ),
    ).toBe(true)
    expect(
      isFreebuffGeminiThinkerAgent(
        `other/${FREEBUFF_GEMINI_THINKER_AGENT_ID}@0.0.1`,
      ),
    ).toBe(false)
  })
})
