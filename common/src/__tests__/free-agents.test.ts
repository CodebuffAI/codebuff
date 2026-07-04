import { describe, expect, test } from 'bun:test'

import {
  CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
  CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
  CODEBIRDS_GEMINI_PRO_MODEL_ID,
  CODEBIRDS_KIMI_MODEL_ID,
  CODEBIRDS_MINIMAX_MODEL_ID,
  CODEBIRDS_MIMO_V25_MODEL_ID,
  CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
} from '../constants/codebirds-models'
import { minimaxModels } from '../constants/model-config'
import { CODEBIRDS_GEMINI_THINKER_AGENT_ID } from '../constants/codebirds-gemini-thinker'
import {
  getFreebuffRootAgentIdForModel,
  isFreebuffGeminiThinkerAgent,
  isFreeModeAllowedAgentModel,
  shouldUseLocalTokenCountForFreebuffDeepseekFlash,
} from '../constants/free-agents'

const MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3

describe('free mode agent model allowlist', () => {
  test('maps supported codebirds models to concrete root agents', () => {
    expect(getFreebuffRootAgentIdForModel(CODEBIRDS_MINIMAX_MODEL_ID)).toBe(
      'base2-free',
    )
    expect(getFreebuffRootAgentIdForModel(CODEBIRDS_KIMI_MODEL_ID)).toBe(
      'base2-free-kimi',
    )
    expect(
      getFreebuffRootAgentIdForModel(CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe('base2-free-deepseek')
    expect(
      getFreebuffRootAgentIdForModel(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe('base2-free-deepseek-flash')
    expect(getFreebuffRootAgentIdForModel(CODEBIRDS_MIMO_V25_PRO_MODEL_ID)).toBe(
      'base2-free-mimo-pro',
    )
    expect(getFreebuffRootAgentIdForModel(CODEBIRDS_MIMO_V25_MODEL_ID)).toBe(
      'base2-free-mimo',
    )
    expect(getFreebuffRootAgentIdForModel(MINIMAX_M3_MODEL_ID)).toBe(
      'base2-free-minimax-m3',
    )
  })

  test('allows each codebirds root agent only with its configured model', () => {
    expect(
      isFreeModeAllowedAgentModel('base2-free', CODEBIRDS_MINIMAX_MODEL_ID),
    ).toBe(true)
    expect(isFreeModeAllowedAgentModel('base2-free', MINIMAX_M3_MODEL_ID)).toBe(
      false,
    )
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free',
        CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free', CODEBIRDS_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free-kimi', CODEBIRDS_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-deepseek',
        CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-deepseek-flash',
        CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo-pro',
        CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo',
        CODEBIRDS_MIMO_V25_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo',
        CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
      ),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-mimo',
        `${CODEBIRDS_MIMO_V25_MODEL_ID}-20260527`,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free-minimax-m3', MINIMAX_M3_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-minimax-m3',
        CODEBIRDS_MINIMAX_MODEL_ID,
      ),
    ).toBe(false)
  })

  test('allows each codebirds reviewer agent only with its configured model', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax',
        CODEBIRDS_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax',
        CODEBIRDS_KIMI_MODEL_ID,
      ),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax-m3',
        MINIMAX_M3_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax-m3',
        CODEBIRDS_MINIMAX_MODEL_ID,
      ),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-kimi', CODEBIRDS_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-deepseek',
        CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-deepseek-flash',
        CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-mimo-pro',
        CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-mimo',
        CODEBIRDS_MIMO_V25_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('allows legacy code-reviewer-lite with codebirds reviewer models', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        CODEBIRDS_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-lite', MINIMAX_M3_MODEL_ID),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-lite', CODEBIRDS_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
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
      isFreeModeAllowedAgentModel('tmux-cli', CODEBIRDS_MINIMAX_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'codebirds/tmux-cli@0.0.1',
        CODEBIRDS_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'other/tmux-cli@0.0.1',
        CODEBIRDS_MINIMAX_MODEL_ID,
      ),
    ).toBe(false)
  })

  test('allows Gemini Pro for the thinker subagent but not the codebirds root', () => {
    expect(
      isFreeModeAllowedAgentModel('base2-free', CODEBIRDS_GEMINI_PRO_MODEL_ID),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel(
        CODEBIRDS_GEMINI_THINKER_AGENT_ID,
        CODEBIRDS_GEMINI_PRO_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('recognizes the Gemini thinker agent in free mode', () => {
    expect(isFreebuffGeminiThinkerAgent(CODEBIRDS_GEMINI_THINKER_AGENT_ID)).toBe(
      true,
    )
    expect(
      isFreebuffGeminiThinkerAgent(
        `codebirds/${CODEBIRDS_GEMINI_THINKER_AGENT_ID}@0.0.1`,
      ),
    ).toBe(true)
    expect(
      isFreebuffGeminiThinkerAgent(
        `other/${CODEBIRDS_GEMINI_THINKER_AGENT_ID}@0.0.1`,
      ),
    ).toBe(false)
  })

  test('uses local token count only for the DeepSeek Flash codebirds root', () => {
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'base2-free-deepseek-flash',
        model: CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(true)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'codebirds/base2-free-deepseek-flash@0.0.1',
        model: CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(true)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'base2-free-deepseek',
        model: CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(false)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'base2-free-deepseek-flash',
        model: CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
      }),
    ).toBe(false)
    expect(
      shouldUseLocalTokenCountForFreebuffDeepseekFlash({
        agentId: 'other/base2-free-deepseek-flash@0.0.1',
        model: CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(false)
  })
})
