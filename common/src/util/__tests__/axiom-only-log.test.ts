import { describe, expect, test } from 'bun:test'

import {
  ADS_FETCH_COMPLETED_EVENT,
  ADS_FIRST_PARTY_DECISION_EVENT,
  ADS_FIRST_PARTY_CLICK_RECORDED_EVENT,
  ADS_FIRST_PARTY_IMPRESSION_RECORDED_EVENT,
  ADS_FIRST_PARTY_SETTLEMENT_EVENT,
  ADS_FIRST_PARTY_VIEW_ACK_EVENT,
  ADS_EXTERNAL_CONVERSION_POSTBACK_EVENT,
  ADS_IMPREZIA_FETCH_COMPLETED_EVENT,
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
        yield_shadow_sampled: true,
        yield_shadow_policy_version: 'cpc-yield-shadow-v1',
        yield_shadow_scope: 'eligible_single_placement',
        yield_shadow_exclusion_reason: 'none',
        yield_shadow_current_provider: 'gravity',
        yield_shadow_recommended_provider: 'first_party',
        yield_shadow_disagrees: true,
        yield_shadow_first_party_state: 'scored',
        yield_shadow_first_party_value_bucket: '100_plus',
        yield_shadow_gravity_state: 'scored',
        yield_shadow_gravity_value_bucket: '10_to_lt_100',
        yield_shadow_imprezia_state: 'unscored_missing_prior',
        yield_shadow_imprezia_value_bucket: 'unscored',
        yield_actual_attempt_chain: 'gravity>first_party',
        yield_requested_placement_count_bucket: 'one',
        yield_returned_ad_count_bucket: 'one',
        yield_live_mode: 'live',
        yield_live_activated: true,
        yield_live_reason: 'live',
        yield_live_arm: 'treatment',
        yield_live_policy_version: 'policy:v1',
        yield_live_estimate_version: 'estimates-v1',
        yield_live_effective_treatment_bps: 50,
        yield_live_planned_chain: 'first_party>gravity>carbon',
        yield_live_evidence_reservation_status: 'reserved',
        yield_live_evidence_status: 'scheduled',
        // Arrays must be producer-encoded as attempted_provider_chain.
        attempted_providers: ['gravity', 'carbon'],
        // High-cardinality identifiers and content do not reach Axiom.
        userId: 'user-123',
        advertiser_id: 'advertiser-123',
        chat_session_id: 'session-123',
        campaign_ids: ['campaign-123'],
        creative_ids: ['creative-123'],
        ad_url: 'https://example.com/secret',
        yield_shadow_raw_ecpm_cents: 123.45,
        yield_shadow_provider_priors: { gravity: 0.12 },
        yield_shadow_provider_outcomes: ['fill'],
        yield_shadow_campaign_id: 'campaign-123',
        yield_shadow_creative_url: 'https://example.com/creative',
        yield_shadow_error: 'upstream timeout',
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
        yield_shadow_sampled: true,
        yield_shadow_policy_version: 'cpc-yield-shadow-v1',
        yield_shadow_scope: 'eligible_single_placement',
        yield_shadow_exclusion_reason: 'none',
        yield_shadow_current_provider: 'gravity',
        yield_shadow_recommended_provider: 'first_party',
        yield_shadow_disagrees: true,
        yield_shadow_first_party_state: 'scored',
        yield_shadow_first_party_value_bucket: '100_plus',
        yield_shadow_gravity_state: 'scored',
        yield_shadow_gravity_value_bucket: '10_to_lt_100',
        yield_shadow_imprezia_state: 'unscored_missing_prior',
        yield_shadow_imprezia_value_bucket: 'unscored',
        yield_actual_attempt_chain: 'gravity>first_party',
        yield_requested_placement_count_bucket: 'one',
        yield_returned_ad_count_bucket: 'one',
        yield_live_mode: 'live',
        yield_live_activated: true,
        yield_live_reason: 'live',
        yield_live_arm: 'treatment',
        yield_live_policy_version: 'policy:v1',
        yield_live_estimate_version: 'estimates-v1',
        yield_live_effective_treatment_bps: 50,
        yield_live_planned_chain: 'first_party>gravity>carbon',
        yield_live_evidence_reservation_status: 'reserved',
        yield_live_evidence_status: 'scheduled',
      },
    })
  })

  test('keeps Imprezia completion telemetry bounded and identity-free', () => {
    expect(
      getAxiomOnlyLogEvent({
        axiomEvent: ADS_IMPREZIA_FETCH_COMPLETED_EVENT,
        outcome: 'provider_error',
        selection_reason: 'fallback',
        experiment_arm: 'control',
        surface: 'freebuff_web_chat',
        ad_count: 0,
        duration_ms: 42,
        test_mode: false,
        failure_class: 'provider_failure',
        userId: 'user-private',
        sessionId: 'session-private',
        requestId: 'request-private',
        request: 'private prompt',
        response: 'private response',
        ad: { title: 'private creative' },
        clickUrl: 'https://private.example/click',
        error: new Error('private raw provider error'),
      }),
    ).toEqual({
      event: ADS_IMPREZIA_FETCH_COMPLETED_EVENT,
      data: {
        outcome: 'provider_error',
        selection_reason: 'fallback',
        experiment_arm: 'control',
        surface: 'freebuff_web_chat',
        ad_count: 0,
        duration_ms: 42,
        test_mode: false,
        failure_class: 'provider_failure',
      },
    })
  })

  test('rejects unbounded or incomplete Imprezia completion dimensions', () => {
    const valid = {
      axiomEvent: ADS_IMPREZIA_FETCH_COMPLETED_EVENT,
      outcome: 'no_fill',
      selection_reason: 'primary',
      experiment_arm: 'imprezia_first',
      surface: 'freebuff_web_chat',
      ad_count: 0,
      duration_ms: 42,
      test_mode: false,
    }
    for (const invalid of [
      { ...valid, outcome: 'private raw error' },
      { ...valid, selection_reason: 'campaign-123' },
      { ...valid, experiment_arm: 'user-123' },
      { ...valid, surface: 'https://private.example' },
      { ...valid, ad_count: 2 },
      { ...valid, outcome: 'fill', ad_count: 0 },
      { ...valid, duration_ms: -1 },
      { ...valid, duration_ms: 60_001 },
      { ...valid, failure_class: 'raw upstream stack trace' },
      { ...valid, test_mode: 'false' },
      // Every dimension except failure_class is required.
      { ...valid, experiment_arm: undefined },
    ]) {
      expect(getAxiomOnlyLogEvent(invalid)).toBeNull()
    }
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
