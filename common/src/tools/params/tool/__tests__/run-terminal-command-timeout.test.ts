import { describe, expect, it } from 'bun:test'

import {
  clampTerminalTimeoutSeconds,
  MAX_TERMINAL_TIMEOUT_SECONDS,
} from '../run-terminal-command'

describe('clampTerminalTimeoutSeconds', () => {
  it('clamps the exaggerated budgets models actually pick', () => {
    // Reported from production: 3-minute, 10-minute and 50-minute waits for
    // work that finishes in seconds. Nothing in the runtime bounded these —
    // the model's number reached the client verbatim.
    expect(clampTerminalTimeoutSeconds(3000)).toBe(MAX_TERMINAL_TIMEOUT_SECONDS)
    expect(clampTerminalTimeoutSeconds(1800)).toBe(MAX_TERMINAL_TIMEOUT_SECONDS)
    expect(clampTerminalTimeoutSeconds(601)).toBe(MAX_TERMINAL_TIMEOUT_SECONDS)
  })

  it('leaves ordinary budgets alone', () => {
    expect(clampTerminalTimeoutSeconds(30)).toBe(30)
    expect(clampTerminalTimeoutSeconds(180)).toBe(180)
    expect(clampTerminalTimeoutSeconds(MAX_TERMINAL_TIMEOUT_SECONDS)).toBe(
      MAX_TERMINAL_TIMEOUT_SECONDS,
    )
  })

  it('preserves the -1 no-timeout sentinel', () => {
    // The explicit escape hatch for genuinely open-ended commands. Clamping it
    // to 600 would silently break `cli/src/commands/router.ts`, which passes -1
    // deliberately.
    expect(clampTerminalTimeoutSeconds(-1)).toBe(-1)
  })

  it('leaves an absent value to the schema default', () => {
    expect(clampTerminalTimeoutSeconds(undefined)).toBeUndefined()
  })

  it('treats nonsense values as the default rather than an instant timeout', () => {
    // 0 or a stray negative is a malformed choice, not a request to fail
    // immediately — which is what passing it through would cause.
    expect(clampTerminalTimeoutSeconds(0)).toBe(30)
    expect(clampTerminalTimeoutSeconds(-5)).toBe(30)
    expect(clampTerminalTimeoutSeconds(Number.NaN)).toBe(
      MAX_TERMINAL_TIMEOUT_SECONDS,
    )
    expect(clampTerminalTimeoutSeconds(Number.POSITIVE_INFINITY)).toBe(
      MAX_TERMINAL_TIMEOUT_SECONDS,
    )
  })
})
