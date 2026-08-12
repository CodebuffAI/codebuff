import { describe, expect, test } from 'bun:test'
import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import {
  AGENT_MODE_TO_ID,
  AGENT_MODES,
  CLI_HARNESS,
  IS_FREEBUFF,
} from '../utils/constants'
import { getFreebuffCliAgentIdForModel } from '../utils/freebuff-agent-selection'

/**
 * Which harness real CLI turns run.
 *
 * `CLI_HARNESS` routes Codebuff DEFAULT and LITE plus every Freebuff picker
 * model to base3 (docs/freebuff-base3-harness.md).
 *
 * The values below are written out rather than derived from `CLI_HARNESS`, and
 * that is the entire point: an expectation computed from the constant would
 * follow it and pass either way. Switching harness has to fail here and be
 * updated deliberately, with the benchmark that justifies it.
 */
describe('CLI harness routing', () => {
  test('DEFAULT, LITE, and Freebuff turns run base3', () => {
    expect(CLI_HARNESS).toBe('base3')
    expect(AGENT_MODE_TO_ID.DEFAULT).toBe('base3')
    // Freebuff overrides LITE per selected model at send time
    // (getAgentIdForMode); this constant is the non-runtime fallback, so it is
    // the paid Codebuff value that tracks the harness.
    // IS_FREEBUFF is a build flag, not the harness — deriving from it is fine.
    expect(AGENT_MODE_TO_ID.LITE).toBe(
      IS_FREEBUFF ? 'base2-free' : 'base3-lite',
    )
    expect(
      getFreebuffCliAgentIdForModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe('base3-free-deepseek-flash')
  })

  test('MAX and PLAN never followed the harness switch', () => {
    // MAX's multi-prompt editor and reviewer fan-out are what the mode is for,
    // and PLAN's <PLAN> extraction is tuned against base2's plan-only prompt.
    expect(AGENT_MODE_TO_ID.MAX).toBe('base2-max')
    expect(AGENT_MODE_TO_ID.PLAN).toBe('base2-plan')
  })

  test('every mode still resolves to an agent id', () => {
    expect(AGENT_MODES).toEqual(['DEFAULT', 'LITE', 'MAX', 'PLAN'])
    for (const mode of AGENT_MODES) {
      expect(AGENT_MODE_TO_ID[mode]).toBeTruthy()
    }
  })
})
