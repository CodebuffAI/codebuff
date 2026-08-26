import { describe, expect, test } from 'bun:test'

import {
  ADS_FETCH_COMPLETED_EVENT,
  ADS_FIRST_PARTY_DECISION_EVENT,
  ADS_FIRST_PARTY_CLICK_RECORDED_EVENT,
  ADS_FIRST_PARTY_IMPRESSION_RECORDED_EVENT,
  ADS_FIRST_PARTY_SETTLEMENT_EVENT,
  ADS_FIRST_PARTY_VIEW_ACK_EVENT,
  ADS_EXTERNAL_CONVERSION_POSTBACK_EVENT,
  CONTEXT_PRUNING_COMPLETED_EVENT,
  getAxiomOnlyLogEvent,
  STREAM_RECOVERY_EVENT,
} from '../axiom-only-log'

describe('getAxiomOnlyLogEvent', () => {
  test('sanitizes context-pruning metadata', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: CONTEXT_PRUNING_COMPLETED_EVENT,
        trigger_reason: 'context_limit',
        client_session_id: 'turn-123',
        dropped_user_entry_count: 2,
        live_user_prompt_text_preserved: true,
        prompt: 'must not leave the client',
        nested: { secret: true },
        context_token_count: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      event: CONTEXT_PRUNING_COMPLETED_EVENT,
      data: {
        trigger_reason: 'context_limit',
        client_session_id: 'turn-123',
        dropped_user_entry_count: 2,
        live_user_prompt_text_preserved: true,
      },
    })
  })

  test('does not treat arbitrary events as Axiom-only', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: 'untrusted.event',
        prompt: 'secret',
      }),
    ).toBeNull()
  })

  test('does not treat an Object.prototype property name as a registered event', () => {
    // The event name is caller-supplied (any logger.*(data, msg) call sets
    // `data.axiomEvent`). Guards against ever matching it with a lookup keyed
    // on that name (e.g. a plain-object registry), where 'constructor' would
    // resolve through the prototype chain and get treated as registered —
    // shipping `{}` in place of the log's real payload. Must be rejected like
    // any other unknown event, via both the data-field and event-param path.
    for (const poisonEvent of [
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
      '__proto__',
    ]) {
      expect(
        getAxiomOnlyLogEvent({
          axiomEvent: poisonEvent,
          prompt: 'must not be silently dropped',
        }),
      ).toBeNull()
      expect(
        getAxiomOnlyLogEvent(
          { prompt: 'must not be silently dropped' },
          poisonEvent,
        ),
      ).toBeNull()
    }
  })

  test('sanitizes the client wire format identified by its top-level event', () => {
    expect(
      getAxiomOnlyLogEvent(
        {
          dropped_user_entry_count: 2,
          prompt: 'must not reach Axiom',
        },
        CONTEXT_PRUNING_COMPLETED_EVENT,
      ),
    ).toEqual({
      event: CONTEXT_PRUNING_COMPLETED_EVENT,
      data: { dropped_user_entry_count: 2 },
    })
  })

  test('accepts an allowlisted top-level event with empty data', () => {
    expect(getAxiomOnlyLogEvent(null, CONTEXT_PRUNING_COMPLETED_EVENT)).toEqual(
      {
        event: CONTEXT_PRUNING_COMPLETED_EVENT,
        data: {},
      },
    )
  })

  test('sanitizes stream-recovery metadata', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: STREAM_RECOVERY_EVENT,
        metric: 'stream_recovery_detected',
        source: 'stream-interrupted',
        model: 'openrouter/anthropic/claude-sonnet-4.5',
        agentId: 'base2',
        runId: 'run-123',
        userInputId: 'input-456',
        finishReason: 'unknown',
        hasYieldedContent: true,
        consecutive: 2,
        // Not in the allowlist: must not leak through.
        userId: 'user-789',
        message: 'must not leave the client',
        messageHistory: [{ role: 'user', content: 'secret' }],
      }),
    ).toEqual({
      event: STREAM_RECOVERY_EVENT,
      data: {
        metric: 'stream_recovery_detected',
        source: 'stream-interrupted',
        model: 'openrouter/anthropic/claude-sonnet-4.5',
        agentId: 'base2',
        runId: 'run-123',
        userInputId: 'input-456',
        finishReason: 'unknown',
        hasYieldedContent: true,
        consecutive: 2,
      },
    })
  })

  test('drops a stream-recovery field with the wrong value type', () => {
    // consecutive must be a number; a string value for it (or any other
    // type mismatch) is dropped rather than coerced.
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: STREAM_RECOVERY_EVENT,
        metric: 'stream_recovery_rescued',
        consecutive: '2',
      }),
    ).toEqual({
      event: STREAM_RECOVERY_EVENT,
      data: { metric: 'stream_recovery_rescued' },
    })
  })

  test('preserves bounded scalar ad-routing metadata and drops identifiers', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: ADS_FETCH_COMPLETED_EVENT,
        outcome: 'fill',
        requested_provider: 'gravity',
        served_provider: 'first_party',
        attempted_provider_chain: 'gravity>first_party',
        experiment_arm: 'treatment',
        first_party_route: 'gravity_then_first_party',
        first_party_primary_percent: 10,
        first_party_backfill_enabled: true,
        first_party_billing_mode: 'cpa',
        external_settlement_enabled: false,
        first_party_primary_cohort: 'pilot-a',
        first_party_primary_cohort_percent: 1,
        first_party_served_cohort: 'pilot-a',
        first_party_entrypoint: 'primary',
        gravity_outcome: 'no_fill',
        selection_reason: 'gravity_no_fill_backfill',
        ad_count: 1,
        surface: 'cli',
        placement_id: 'CLI-Chat-Inline',
        duration_ms: 42,
        client_ua_product: 'freebuff-cli',
        client_ua_version: '1.2.3',
        // Arrays must be producer-encoded as attempted_provider_chain.
        attempted_providers: ['gravity', 'carbon'],
        // High-cardinality identifiers and content do not reach Axiom.
        userId: 'user-123',
        advertiser_id: 'advertiser-123',
        chat_session_id: 'session-123',
        campaign_ids: ['campaign-123'],
        creative_ids: ['creative-123'],
        ad_url: 'https://example.com/secret',
        messages: [{ role: 'user', content: 'secret' }],
      }),
    ).toEqual({
      event: ADS_FETCH_COMPLETED_EVENT,
      data: {
        outcome: 'fill',
        requested_provider: 'gravity',
        served_provider: 'first_party',
        attempted_provider_chain: 'gravity>first_party',
        experiment_arm: 'treatment',
        first_party_route: 'gravity_then_first_party',
        first_party_primary_percent: 10,
        first_party_backfill_enabled: true,
        first_party_billing_mode: 'cpa',
        external_settlement_enabled: false,
        first_party_primary_cohort: 'pilot-a',
        first_party_primary_cohort_percent: 1,
        first_party_served_cohort: 'pilot-a',
        first_party_entrypoint: 'primary',
        gravity_outcome: 'no_fill',
        selection_reason: 'gravity_no_fill_backfill',
        ad_count: 1,
        surface: 'cli',
        placement_id: 'CLI-Chat-Inline',
        duration_ms: 42,
        client_ua_product: 'freebuff-cli',
        client_ua_version: '1.2.3',
      },
    })
  })

  test('names and sanitizes first-party selection telemetry', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: ADS_FIRST_PARTY_DECISION_EVENT,
        outcome: 'no_fill',
        no_fill_reason: 'no_eligible_campaign',
        primary_allocation_invalid: true,
        placement_count: 2,
        candidate_count: 4,
        candidate_load_ms: 8,
        frequency_status: 'unavailable',
        frequency_unavailable_cause: 'timeout',
        frequency_reservation_ms: 75,
        duration_ms: 11,
        campaign_ids: ['campaign-123'],
        creative_ids: ['creative-123'],
        placement_ids: ['CLI-Chat-Inline'],
        userId: 'user-123',
        reasons: ['budget_exhausted'],
        nested: { private: true },
      }),
    ).toEqual({
      event: ADS_FIRST_PARTY_DECISION_EVENT,
      data: {
        outcome: 'no_fill',
        no_fill_reason: 'no_eligible_campaign',
        primary_allocation_invalid: true,
        placement_count: 2,
        candidate_count: 4,
        candidate_load_ms: 8,
        frequency_status: 'unavailable',
        frequency_unavailable_cause: 'timeout',
        frequency_reservation_ms: 75,
        duration_ms: 11,
      },
    })
  })

  test('names and sanitizes first-party settlement telemetry', () => {
    expect(
      getAxiomOnlyLogEvent(
        {
          billing_model: 'cpa',
          settlement_status: 'charged',
          amount_cents: 75,
          balance_cents: 925,
          duration_ms: 6,
          userId: 'user-123',
          advertiser_id: 'advertiser-123',
          campaign_id: 'campaign-123',
          ad_impression_id: 'impression-123',
          error: { message: 'private failure detail' },
        },
        ADS_FIRST_PARTY_SETTLEMENT_EVENT,
      ),
    ).toEqual({
      event: ADS_FIRST_PARTY_SETTLEMENT_EVENT,
      data: {
        billing_model: 'cpa',
        settlement_status: 'charged',
        amount_cents: 75,
        balance_cents: 925,
        duration_ms: 6,
      },
    })
  })

  test('keeps first-party tracking telemetry content- and identity-free', () => {
    for (const event of [
      ADS_FIRST_PARTY_CLICK_RECORDED_EVENT,
      ADS_FIRST_PARTY_IMPRESSION_RECORDED_EVENT,
    ]) {
      expect(
        getAxiomOnlyLogEvent({
          axiomEvent: event,
          provider: 'first_party',
          surface: 'cli_chat',
          placement_id: 'CLI-Chat-Inline',
          already_clicked: false,
          pixel_count: 0,
          userId: 'user-private',
          ad_impression_id: 'impression-private',
          title: 'private creative',
          cta: 'private cta',
          ad_url: 'https://advertiser.example/private',
        }),
      ).toEqual({
        event,
        data: {
          provider: 'first_party',
          surface: 'cli_chat',
          placement_id: 'CLI-Chat-Inline',
          already_clicked: false,
          pixel_count: 0,
        },
      })
    }
  })

  test('accepts only the exact bounded first-party view acknowledgement schema', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: ADS_FIRST_PARTY_VIEW_ACK_EVENT,
        surface: 'waiting_room',
        placement_id: 'waiting-room-1',
        outcome: 'accepted',
        attempt: 1,
        duration_ms: 250,
        client_family: 'cli',
      }),
    ).toEqual({
      event: ADS_FIRST_PARTY_VIEW_ACK_EVENT,
      data: {
        surface: 'waiting_room',
        placement_id: 'waiting-room-1',
        outcome: 'accepted',
        attempt: 1,
        duration_ms: 250,
        client_family: 'cli',
      },
    })
  })

  test('rejects malformed or private first-party view acknowledgement payloads', () => {
    const valid = {
      surface: 'cli_chat',
      placement_id: 'CLI-Chat-Inline',
      outcome: 'network_error',
      attempt: 3,
      duration_ms: 1,
      client_family: 'desktop',
    }
    const invalid = [
      { ...valid, impression_token: 'private-token' },
      { ...valid, error: { message: 'private raw error' } },
      { ...valid, url: 'https://private.example' },
      { ...valid, placement_id: 'unknown-slot' },
      { ...valid, surface: 'waiting_room' },
      { ...valid, outcome: 'retrying' },
      { ...valid, attempt: 0 },
      { ...valid, attempt: 4 },
      { ...valid, attempt: 1.5 },
      { ...valid, duration_ms: Number.POSITIVE_INFINITY },
      { ...valid, duration_ms: -1 },
      { ...valid, duration_ms: 10_001 },
      { ...valid, client_family: 'mobile' },
    ]
    for (const payload of invalid) {
      expect(
        getAxiomOnlyLogEvent({
          axiomEvent: ADS_FIRST_PARTY_VIEW_ACK_EVENT,
          ...payload,
        }),
      ).toBeNull()
    }
    expect(getAxiomOnlyLogEvent(valid, ADS_FIRST_PARTY_VIEW_ACK_EVENT)).toEqual(
      {
        event: ADS_FIRST_PARTY_VIEW_ACK_EVENT,
        data: valid,
      },
    )
  })

  test('keeps external conversion postbacks content- and identifier-free', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: ADS_EXTERNAL_CONVERSION_POSTBACK_EVENT,
        outcome: 'accepted',
        rejection_reason: 'none',
        event_type: 'signup_completed',
        traffic_class: 'test',
        primary_allocation_cohort: 'drizz',
        settlement_status: 'not_billable',
        charged_cents: 0,
        duration_ms: 8,
        api_key: 'fbadv_private',
        key_prefix: 'fbadv_123',
        bfcid: 'bfc_test_1.private',
        event_id: 'private-event',
        campaign_id: 'campaign-private',
        advertiser_id: 'advertiser-private',
        user_id: 'user-private',
        email: 'private@example.com',
        url: 'https://partner.example/private',
        body: { private: true },
        error: new Error('private failure'),
      }),
    ).toEqual({
      event: ADS_EXTERNAL_CONVERSION_POSTBACK_EVENT,
      data: {
        outcome: 'accepted',
        rejection_reason: 'none',
        event_type: 'signup_completed',
        traffic_class: 'test',
        primary_allocation_cohort: 'drizz',
        settlement_status: 'not_billable',
        charged_cents: 0,
        duration_ms: 8,
      },
    })
  })
})
