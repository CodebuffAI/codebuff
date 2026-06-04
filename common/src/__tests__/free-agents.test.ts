import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
} from '../constants/freebuff-models'
import { minimaxModels } from '../constants/model-config'
import { FREEBUFF_GEMINI_THINKER_AGENT_ID } from '../constants/freebuff-gemini-thinker'
import {
  getFreebuffRootAgentIdForModel,
  isFreebuffGeminiThinkerAgent,
  isFreeModeAllowedAgentModel,
  shouldUseLocalTokenCountForFreebuffDeepseekFlash,
} from '../constants/free-agents'

const MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3

describe('free mode agent model allowlist', () => {
  test('maps supported freebuff models to concrete root agents', () => {
    expect(getFreebuffRootAgentIdForModel(FREEBUFF_MINIMAX_MODEL_ID)).toBe(
      'base2-free',
    )
    expect(getFreebuffRootAgentIdForModel(FREEBUFF_KIMI_MODEL_ID)).toBe(
      'base2-free-kimi',
    )
    expect(
      getFreebuffRootAgentIdForModel(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe('base2-free-deepseek')
    expect(
      getFreebuffRootAgentIdForModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe('base2-free-deepseek-flash')
    expect(getFreebuffRootAgentIdForModel(FREEBUFF_MIMO_V25_PRO_MODEL_ID)).toBe(
      'base2-free-mimo-pro',
    )
    expect(getFreebuffRootAgentIdForModel(FREEBUFF_MIMO_V25_MODEL_ID)).toBe(
      'base2-free-mimo',
    )
  })

  test('allows each freebuff root agent only with its configured model', () => {
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREEBUFF_MINIMAX_MODEL_ID),
    ).toBe(true)
    expect(isFreeModeAllowedAgentModel('base2-free', MINIMAX_M3_MODEL_ID)).toBe(
      false,
    )
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free',
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREEBUFF_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free-kimi', FREEBUFF_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-deepseek',
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-deepseek-flash',
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo-pro',
        FREEBUFF_MIMO_V25_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo',
        FREEBUFF_MIMO_V25_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo',
        FREEBUFF_MIMO_V25_PRO_MODEL_ID,
      ),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo',
        `${FREEBUFF_MIMO_V25_MODEL_ID}-20260527`,
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
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-deepseek-flash',
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-mimo-pro',
        FREEBUFF_MIMO_V25_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-mimo',
        FREEBUFF_MIMO_V25_MODEL_ID,
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
      isFreeModeAllowedAgentModel('code-reviewer-lite', MINIMAX_M3_MODEL_ID),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-lite', FREEBUFF_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
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

  test('allows the tmux-cli subagent with its bundled model', () => {
    expect(
      isFreeModeAllowedAgentModel('tmux-cli', FREEBUFF_MINIMAX_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'codebuff/tmux-cli@0.0.1',
        FREEBUFF_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'other/tmux-cli@0.0.1',
        FREEBUFF_MINIMAX_MODEL_ID,
      ),
    ).toBe(false)
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

  test('uses local token count only for the DeepSeek Flash freebuff root', () => {
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'base2-free-deepseek-flash',
        model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(true)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'codebuff/base2-free-deepseek-flash@0.0.1',
        model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(true)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'base2-free-deepseek',
        model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(false)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'base2-free-deepseek-flash',
        model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      }),
    ).toBe(false)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'other/base2-free-deepseek-flash@0.0.1',
        model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(false)
  })
})
