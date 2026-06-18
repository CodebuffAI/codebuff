import { describe, expect, it } from 'bun:test'

import { scoreApiAbuse } from '../freebuff-abuse-scoring'

import type { ApiAbuseRawRow } from '../freebuff-abuse-scoring'

const NOW = new Date('2026-06-18T00:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

function makeRow(overrides: Partial<ApiAbuseRawRow> = {}): ApiAbuseRawRow {
  return {
    user_id: 'u',
    email: null,
    name: null,
    banned: false,
    user_created_at: null,
    message_count: 0,
    run_count: 0,
    client_id_count: 0,
    missing_step_messages: 0,
    missing_step_runs: 0,
    max_messages_per_run: 0,
    max_client_ids_per_run: 0,
    avg_client_ids_per_run: 0,
    max_run_duration_minutes: null,
    running_run_count: 0,
    completed_run_count: 0,
    model_count: 0,
    agent_count: 0,
    first_message_at: '',
    last_message_at: '',
    models: null,
    agents: null,
    sample_runs: null,
    ...overrides,
  }
}

describe('scoreApiAbuse', () => {
  it('flags a heavy held-open proxy reseller with a high score', () => {
    const { score, flags } = scoreApiAbuse(
      makeRow({
        message_count: 2841,
        run_count: 6,
        missing_step_messages: 2730, // ratio ~0.96
        max_messages_per_run: 1204,
        max_client_ids_per_run: 84,
        max_run_duration_minutes: 413,
        user_created_at: daysAgo(2),
      }),
      NOW,
    )
    // 60 (proxy) + 15 (no-step) + 15 (long-run) + 15 (heavy) + 12 (msgs/run) + 10 (new-acct)
    expect(score).toBe(127)
    expect(flags.some((f) => f.startsWith('proxy-fanout:84c/run'))).toBe(true)
    expect(flags).toContain('no-agent-steps:96%')
    expect(flags).toContain('long-run:413m')
    expect(flags).toContain('new-account:2.0d')
  })

  it('scores proxy fanout by tier on the client-id-per-run gate', () => {
    // message_count kept low so only the Tier-A proxy signal contributes.
    const tier = (maxClients: number, missing: number) =>
      scoreApiAbuse(
        makeRow({
          message_count: 10,
          run_count: 1,
          missing_step_messages: missing,
          max_client_ids_per_run: maxClients,
        }),
        NOW,
      ).score

    expect(tier(20, 5)).toBe(60) // >=20 & >=50% missing
    expect(tier(10, 5)).toBe(50) // >=10
    expect(tier(5, 5)).toBe(35) // >=5
    expect(tier(3, 8)).toBe(20) // >=3 needs >=75% missing
    expect(tier(3, 5)).toBe(0) // >=3 but only 50% missing → no signal
  })

  it('flags a single-shot sock farm', () => {
    const { score, flags } = scoreApiAbuse(
      makeRow({
        message_count: 217,
        run_count: 214, // ~1.01 msgs/run
        missing_step_messages: 215, // ratio ~0.99
        max_client_ids_per_run: 1,
      }),
      NOW,
    )
    // 60 (farm) + 15 (no-step) + 8 (high-volume)
    expect(score).toBe(83)
    expect(flags.some((f) => f.startsWith('farm:214runs'))).toBe(true)
  })

  it('does not flag a legit power user with real agent steps (volume alone scores nothing)', () => {
    const { score, flags } = scoreApiAbuse(
      makeRow({
        message_count: 1000,
        run_count: 50, // 20 msgs/run
        missing_step_messages: 100, // ratio 0.1 → real steps
        max_client_ids_per_run: 1,
        max_messages_per_run: 40,
      }),
      NOW,
    )
    expect(score).toBe(0)
    expect(flags.some((f) => f.startsWith('real-steps:'))).toBe(true)
  })

  it('dampens a tenured account with only a weak proxy signal', () => {
    const { score, flags } = scoreApiAbuse(
      makeRow({
        message_count: 100,
        run_count: 20,
        missing_step_messages: 50, // ratio 0.5
        max_client_ids_per_run: 5, // weak proxy tier (+35), not the strong >=10 gate
        user_created_at: daysAgo(90),
      }),
      NOW,
    )
    // 35 (proxy) + 8 (high-volume) - 30 (tenured)
    expect(score).toBe(13)
    expect(flags).toContain('tenured:90d')
  })

  it('keeps the strong proxy gate even for tenured accounts', () => {
    const { flags } = scoreApiAbuse(
      makeRow({
        message_count: 100,
        run_count: 10,
        missing_step_messages: 50, // ratio 0.5
        max_client_ids_per_run: 10, // strong gate: >=10 & >=50% missing
        user_created_at: daysAgo(400),
      }),
      NOW,
    )
    // Strong proxy signal exempts the tenure dampener.
    expect(flags).not.toContain('tenured:400d')
  })

  it('never returns a negative score', () => {
    const { score } = scoreApiAbuse(
      makeRow({
        message_count: 500,
        run_count: 5,
        missing_step_messages: 0, // ratio 0 → real-steps dampener (-40)
        max_client_ids_per_run: 2,
      }),
      NOW,
    )
    expect(score).toBe(0)
  })
})
