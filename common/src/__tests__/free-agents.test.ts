import { describe, expect, test } from 'bun:test'

import { GEMINI_3_1_FLASH_LITE_MODEL_ID } from '../constants/gemini'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
} from '../constants/freebuff-models'
import { minimaxModels } from '../constants/model-config'
import { FREEBUFF_GEMINI_THINKER_AGENT_ID } from '../constants/freebuff-gemini-thinker'
import {
  FREEBUFF_DESKTOP_THREAD_AGENT_ID,
  getFreebuffRootAgentIdForModel,
  isFreebuffGeminiThinkerAgent,
  isFreebuffRootAgent,
  isFreeModeAllowedAgentModel,
  shouldUseLocalTokenCountForFreebuffDeepseekFlash,
} from '../constants/free-agents'

const MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3
// Removed model: support was dropped entirely (client + server).
const LEGACY_MINIMAX_M2_7_MODEL_ID = 'minimax/minimax-m2.7'

describe('free mode agent model allowlist', () => {
  test('maps supported freebuff models to concrete root agents', () => {
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
    expect(getFreebuffRootAgentIdForModel(MINIMAX_M3_MODEL_ID)).toBe(
      'base2-free-minimax-m3',
    )
  })

  test('allows each freebuff root agent only with its configured model', () => {
    expect(isFreeModeAllowedAgentModel('base2-free', MINIMAX_M3_MODEL_ID)).toBe(
      true,
    )
    expect(
      isFreeModeAllowedAgentModel('base2-free', LEGACY_MINIMAX_M2_7_MODEL_ID),
    ).toBe(false)
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
    expect(
      isFreeModeAllowedAgentModel('base2-free-minimax-m3', MINIMAX_M3_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-minimax-m3',
        LEGACY_MINIMAX_M2_7_MODEL_ID,
      ),
    ).toBe(false)
  })

  test('allows each freebuff reviewer agent only with its configured model', () => {
    // The M2.7 reviewer was removed along with the model.
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax',
        LEGACY_MINIMAX_M2_7_MODEL_ID,
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
        LEGACY_MINIMAX_M2_7_MODEL_ID,
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
        LEGACY_MINIMAX_M2_7_MODEL_ID,
      ),
    ).toBe(false)
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

  test('allows the Freebuff Desktop root agent with every desktop model', () => {
    // The desktop runs ONE root id across all its picker models (model chosen
    // per tab), so each desktop-pickable model must be allowed for it.
    for (const model of [
      MINIMAX_M3_MODEL_ID,
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
      FREEBUFF_KIMI_MODEL_ID,
      FREEBUFF_MIMO_V25_PRO_MODEL_ID,
      FREEBUFF_MIMO_V25_MODEL_ID,
    ]) {
      expect(
        isFreeModeAllowedAgentModel(FREEBUFF_DESKTOP_THREAD_AGENT_ID, model),
      ).toBe(true)
    }
    // It's a recognized free-mode root (so its subagents pass the hierarchy gate
    // and the "You are Buffy" marker gate applies to it).
    expect(isFreebuffRootAgent(FREEBUFF_DESKTOP_THREAD_AGENT_ID)).toBe(true)
    // A non-free premium model (e.g. raw Claude) stays disallowed even for it.
    expect(
      isFreeModeAllowedAgentModel(
        FREEBUFF_DESKTOP_THREAD_AGENT_ID,
        'anthropic/claude-sonnet-4.5',
      ),
    ).toBe(false)
    // Publisher-spoof safe.
    expect(
      isFreeModeAllowedAgentModel(
        `other/${FREEBUFF_DESKTOP_THREAD_AGENT_ID}@0.0.1`,
        MINIMAX_M3_MODEL_ID,
      ),
    ).toBe(false)
  })

  test('allows Gemini helper agents only with the stable bundled model', () => {
    for (const agentId of [
      'file-picker-max',
      'file-lister',
      'researcher-web',
      'researcher-docs',
      'browser-use',
      'basher',
    ]) {
      expect(
        isFreeModeAllowedAgentModel(agentId, GEMINI_3_1_FLASH_LITE_MODEL_ID),
      ).toBe(true)
      expect(
        isFreeModeAllowedAgentModel(
          agentId,
          'google/gemini-3.1-flash-lite-preview',
        ),
      ).toBe(false)
    }
  })

  test('allows the tmux-cli subagent with its bundled model', () => {
    expect(isFreeModeAllowedAgentModel('tmux-cli', MINIMAX_M3_MODEL_ID)).toBe(
      true,
    )
    expect(
      isFreeModeAllowedAgentModel(
        'codebuff/tmux-cli@0.0.1',
        MINIMAX_M3_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('other/tmux-cli@0.0.1', MINIMAX_M3_MODEL_ID),
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
