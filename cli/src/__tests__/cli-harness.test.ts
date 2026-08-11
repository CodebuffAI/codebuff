import { describe, expect, test } from 'bun:test'

import {
  AGENT_MODE_TO_ID,
  AGENT_MODES,
  CLI_HARNESS,
  IS_FREEBUFF,
} from '../utils/constants'

/**
 * Which harness real CLI turns run.
 *
 * base3 lost to base2 by 0.91 on buffbench with DeepSeek V4 Flash — the default
 * free model — by leaving work unfinished, so `CLI_HARNESS` routes to base2
 * while the base3 roots stay in the tree to be tweaked and re-measured
 * (docs/freebuff-base3-harness.md).
 *
 * The values below are written out rather than derived from `CLI_HARNESS`, and
 * that is the entire point: an expectation computed from the constant would
 * follow it and pass either way. Switching harness has to fail here and be
 * updated deliberately, with the benchmark that justifies it.
 */
describe('CLI harness routing', () => {
  test('CLI turns run base2', () => {
    expect(CLI_HARNESS).toBe('base2')
    expect(AGENT_MODE_TO_ID.DEFAULT).toBe('base2')
    // Freebuff overrides LITE per selected model at send time
    // (getAgentIdForMode); this constant is the non-runtime fallback, so it is
    // the paid Codebuff value that tracks the harness.
    // IS_FREEBUFF is a build flag, not the harness — deriving from it is fine.
    expect(AGENT_MODE_TO_ID.LITE).toBe(
      IS_FREEBUFF ? 'base2-free' : 'base2-lite',
    )
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
