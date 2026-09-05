import { describe, expect, test } from 'bun:test'

import {
  SUPABASE_FORMAT_EXPERIMENT_VERSION,
  admitSupabaseFormatCandidate,
  aggregateSupabaseFormatExperiment,
  evaluateSupabaseMatchedEligibility,
  supabaseFormatArmForUser,
  type SupabaseFormatCandidate,
  type SupabaseFormatExperimentEvent,
  type SupabaseMatchedEligibilityInput,
} from './supabase-format-experiment'

function eligibility(
  userId: string | null | undefined = 'user-1',
  surface = 'cli_chat',
): SupabaseMatchedEligibilityInput {
  return {
    userId,
    relevance: {
      status: 'matched',
      angle: 'database',
      decisionId: `decision-${surface}`,
      policyVersion: 'supabase-intent-v1',
    },
    sameTaskProcedure: {
      status: 'applicable',
      procedureHash: 'sha256:procedure-v1',
    },
    executionSurface: { status: 'supported', surface },
  }
}

const availableCandidates: Record<
  'display' | 'agentic',
  SupabaseFormatCandidate
> = {
  display: {
    status: 'available',
    candidateId: 'creative-supabase-1',
    campaignId: 'campaign-display',
    contentHash: 'sha256:display-v1',
  },
  agentic: {
    status: 'available',
    candidateId: 'procedure-supabase-1',
    campaignId: 'campaign-agentic',
    contentHash: 'sha256:agentic-v1',
  },
}

describe('Supabase format assignment', () => {
  test('has pinned vectors and assigns authenticated users only', () => {
    expect(supabaseFormatArmForUser('user-1')).toBe('display')
    expect(supabaseFormatArmForUser('user-2')).toBe('agentic')
    expect(supabaseFormatArmForUser('abc')).toBe('agentic')
    expect(
      supabaseFormatArmForUser('550e8400-e29b-41d4-a716-446655440000'),
    ).toBe('display')
    for (const id of [null, undefined, '', '   ']) {
      expect(supabaseFormatArmForUser(id)).toBeNull()
    }
  })

  test('stays fixed across retries and execution surfaces', () => {
    const first = admitSupabaseFormatCandidate({
      eligibility: eligibility('user-1', 'cli_chat'),
      candidates: availableCandidates,
    })
    const retry = admitSupabaseFormatCandidate({
      eligibility: eligibility('user-1', 'freebuff_web_chat'),
      candidates: availableCandidates,
    })

    expect(first).toMatchObject({ status: 'serve', arm: 'display' })
    expect(retry).toMatchObject({ status: 'serve', arm: 'display' })
    for (let index = 0; index < 20; index++) {
      expect(supabaseFormatArmForUser('user-1')).toBe('display')
    }
  })

  test('is approximately balanced over a large deterministic cohort', () => {
    const cohortSize = 50_000
    let display = 0
    for (let index = 0; index < cohortSize; index++) {
      if (supabaseFormatArmForUser(`cohort-user-${index}`) === 'display') {
        display++
      }
    }
    expect(display / cohortSize).toBeGreaterThan(0.49)
    expect(display / cohortSize).toBeLessThan(0.51)
  })
})

describe('Supabase matched eligibility and admission', () => {
  test('requires relevance, same-task applicability, and surface support', () => {
    expect(evaluateSupabaseMatchedEligibility(eligibility()).eligible).toBe(
      true,
    )

    const cases: Array<[SupabaseMatchedEligibilityInput, string]> = [
      [eligibility(null), 'unauthenticated'],
      [
        { ...eligibility(), relevance: { status: 'not_matched' } },
        'relevance_not_matched',
      ],
      [
        { ...eligibility(), relevance: { status: 'unknown' } },
        'relevance_unknown',
      ],
      [
        { ...eligibility(), sameTaskProcedure: { status: 'not_applicable' } },
        'procedure_not_applicable',
      ],
      [
        { ...eligibility(), sameTaskProcedure: { status: 'unknown' } },
        'procedure_unknown',
      ],
      [
        { ...eligibility(), executionSurface: { status: 'unsupported' } },
        'surface_unsupported',
      ],
      [
        { ...eligibility(), executionSurface: { status: 'unknown' } },
        'surface_unknown',
      ],
    ]

    for (const [input, reason] of cases) {
      expect(evaluateSupabaseMatchedEligibility(input)).toEqual({
        eligible: false,
        reason,
      })
      expect(
        admitSupabaseFormatCandidate({
          eligibility: input,
          candidates: availableCandidates,
        }),
      ).toEqual({ status: 'suppressed', reason })
    }
  })

  test('fails closed on malformed matched evidence', () => {
    expect(
      evaluateSupabaseMatchedEligibility({
        ...eligibility(),
        relevance: {
          status: 'matched',
          angle: 'database',
          decisionId: '',
          policyVersion: 'v1',
        },
      }),
    ).toEqual({ eligible: false, reason: 'malformed_evidence' })
  })

  test('no-fills the assigned arm without crossing to available inventory', () => {
    for (const [userId, arm] of [
      ['user-1', 'display'],
      ['user-2', 'agentic'],
    ] as const) {
      for (const reason of [
        'unavailable',
        'funding_exhausted',
        'conversation_cap_reached',
        'paused',
      ] as const) {
        const candidates = {
          ...availableCandidates,
          [arm]: { status: reason },
        }
        expect(
          admitSupabaseFormatCandidate({
            eligibility: eligibility(userId),
            candidates,
          }),
        ).toMatchObject({ status: 'no_fill', arm, reason })
      }
    }
  })

  test('no-fills malformed assigned candidates', () => {
    expect(
      admitSupabaseFormatCandidate({
        eligibility: eligibility('user-1'),
        candidates: {
          ...availableCandidates,
          display: {
            status: 'available',
            candidateId: '',
            campaignId: 'campaign-display',
            contentHash: 'sha256:display-v1',
          },
        },
      }),
    ).toMatchObject({
      status: 'no_fill',
      arm: 'display',
      reason: 'malformed_candidate',
    })
  })
})

type UnversionedEvent = SupabaseFormatExperimentEvent extends infer Event
  ? Event extends SupabaseFormatExperimentEvent
    ? Omit<Event, 'experimentVersion'>
    : never
  : never

function event(value: UnversionedEvent): SupabaseFormatExperimentEvent {
  return {
    ...value,
    experimentVersion: SUPABASE_FORMAT_EXPERIMENT_VERSION,
  } as SupabaseFormatExperimentEvent
}

const displayEligible = event({
  type: 'eligible',
  eventId: 'event-d-eligible',
  occurredAt: '2026-09-01T00:00:00.000Z',
  userId: 'user-1',
  arm: 'display',
  angle: 'database',
  surface: 'cli_chat',
  decisionId: 'decision-d',
  policyVersion: 'supabase-intent-v1',
  procedureHash: 'sha256:procedure-v1',
})
const displayExposure = event({
  type: 'exposure',
  eventId: 'event-d-exposure',
  occurredAt: '2026-09-01T00:01:00.000Z',
  userId: 'user-1',
  arm: 'display',
  angle: 'database',
  surface: 'cli_chat',
  decisionId: 'decision-d',
  deliveryId: 'delivery-d',
  contentHash: 'sha256:display-v1',
})
const agenticEligible = event({
  type: 'eligible',
  eventId: 'event-a-eligible',
  occurredAt: '2026-09-01T00:00:00.000Z',
  userId: 'user-2',
  arm: 'agentic',
  angle: 'auth',
  surface: 'freebuff_web_chat',
  decisionId: 'decision-a',
  policyVersion: 'supabase-intent-v1',
  procedureHash: 'sha256:procedure-v1',
})
const agenticExposure = event({
  type: 'exposure',
  eventId: 'event-a-exposure',
  occurredAt: '2026-09-01T00:01:00.000Z',
  userId: 'user-2',
  arm: 'agentic',
  angle: 'auth',
  surface: 'freebuff_web_chat',
  decisionId: 'decision-a',
  proposalId: 'proposal-a',
  contentHash: 'sha256:agentic-v1',
})

describe('Supabase format report aggregation', () => {
  test('dedupes retries, joins out of order, and reports by arm/angle/surface', () => {
    const events = [
      event({
        type: 'partner_outcome',
        eventId: 'event-a-outcome',
        occurredAt: '2026-09-02T00:00:00.000Z',
        userId: 'user-2',
        arm: 'agentic',
        angle: 'auth',
        surface: 'freebuff_web_chat',
        proposalId: 'proposal-a',
        outcomeId: 'outcome-a',
        qualifiedActivation: true,
      }),
      agenticExposure,
      displayEligible,
      event({
        type: 'click',
        eventId: 'event-d-click',
        occurredAt: '2026-09-01T00:02:00.000Z',
        userId: 'user-1',
        arm: 'display',
        angle: 'database',
        surface: 'cli_chat',
        deliveryId: 'delivery-d',
        actionId: 'click-d',
      }),
      displayExposure,
      { ...displayExposure, eventId: 'event-d-exposure-retry' },
      agenticEligible,
      event({
        type: 'accept',
        eventId: 'event-a-accept',
        occurredAt: '2026-09-01T00:02:00.000Z',
        userId: 'user-2',
        arm: 'agentic',
        angle: 'auth',
        surface: 'freebuff_web_chat',
        proposalId: 'proposal-a',
        actionId: 'accept-a',
      }),
      event({
        type: 'delivery',
        eventId: 'event-a-delivery',
        occurredAt: '2026-09-01T00:03:00.000Z',
        userId: 'user-2',
        arm: 'agentic',
        angle: 'auth',
        surface: 'freebuff_web_chat',
        proposalId: 'proposal-a',
        deliveryId: 'delivery-a',
      }),
    ]

    const report = aggregateSupabaseFormatExperiment(events, {
      metric: 'qualified_partner_activation_per_assigned_eligible_user',
      metricApproved: true,
      attributionWindowMs: 2 * 24 * 60 * 60 * 1000,
      windowApproved: true,
      comparablePostbacks: true,
      partnerOutcomeCoverage: { display: 'complete', agentic: 'complete' },
      matureWindowCoverage: { display: 'complete', agentic: 'complete' },
    })

    expect(report.byArm.display).toMatchObject({
      eligibleUsers: 1,
      eligibleOpportunities: 1,
      exposures: 1,
      clicks: 1,
      accepts: 0,
    })
    expect(report.byArm.agentic).toMatchObject({
      eligibleUsers: 1,
      exposures: 1,
      accepts: 1,
      deliveries: 1,
      partnerOutcomes: 1,
      qualifiedPartnerOutcomes: 1,
    })
    expect(report.rejected.duplicate).toBe(1)
    expect(report.cells).toHaveLength(2)
    expect(report.primaryVerdict).toEqual({
      status: 'measurement_ready',
      metric: 'qualified_partner_activation_per_assigned_eligible_user',
      attributionWindowMs: 2 * 24 * 60 * 60 * 1000,
      display: { eligibleUsers: 1, activations: 0, rate: 0 },
      agentic: { eligibleUsers: 1, activations: 1, rate: 1 },
      winner: null,
    })
  })

  test('keeps the primary verdict unavailable without approved comparable coverage', () => {
    const report = aggregateSupabaseFormatExperiment([
      displayEligible,
      displayExposure,
    ])
    expect(report.primaryVerdict).toEqual({
      status: 'unavailable',
      reasons: [
        'metric_unapproved',
        'window_unapproved',
        'invalid_window',
        'postbacks_not_comparable',
        'display_postback_coverage_incomplete',
        'agentic_postback_coverage_incomplete',
        'display_mature_window_coverage_incomplete',
        'agentic_mature_window_coverage_incomplete',
      ],
    })
  })

  test('rejects malformed, wrong-arm, and orphaned input without inventing counts', () => {
    const report = aggregateSupabaseFormatExperiment([
      null,
      { ...displayEligible, eventId: '' },
      { ...displayEligible, eventId: 'wrong-version', experimentVersion: 'v2' },
      { ...displayEligible, eventId: 'wrong-arm', arm: 'agentic' },
      event({
        type: 'click',
        eventId: 'orphan-click',
        occurredAt: '2026-09-01T00:02:00.000Z',
        userId: 'user-1',
        arm: 'display',
        angle: 'database',
        surface: 'cli_chat',
        deliveryId: 'missing-delivery',
        actionId: 'click-orphan',
      }),
    ])

    expect(report.byArm.display.eligibleUsers).toBe(0)
    expect(report.byArm.display.clicks).toBe(0)
    expect(report.rejected).toEqual({
      malformed: 3,
      duplicate: 0,
      assignmentMismatch: 1,
      orphaned: 1,
    })
  })

  test('freezes the attribution window at first enrollment across later opportunities', () => {
    const secondOpportunity = event({
      type: 'eligible',
      eventId: 'event-d-eligible-2',
      occurredAt: '2026-09-08T00:00:00.000Z',
      userId: 'user-1',
      arm: 'display',
      angle: 'database',
      decisionId: 'decision-d-2',
      policyVersion: 'supabase-intent-v1',
      procedureHash: 'sha256:procedure-v1',
      surface: 'freebuff_web_chat',
    })
    const secondExposure = event({
      type: 'exposure',
      eventId: 'event-d-exposure-2',
      occurredAt: '2026-09-08T00:01:00.000Z',
      userId: 'user-1',
      arm: 'display',
      angle: 'database',
      surface: 'freebuff_web_chat',
      decisionId: 'decision-d-2',
      deliveryId: 'delivery-d-2',
      contentHash: 'sha256:display-v1',
    })
    const report = aggregateSupabaseFormatExperiment(
      [
        displayEligible,
        secondOpportunity,
        secondExposure,
        event({
          type: 'partner_outcome',
          eventId: 'event-d-late',
          occurredAt: '2026-09-10T00:00:00.000Z',
          userId: 'user-1',
          arm: 'display',
          angle: 'database',
          surface: 'freebuff_web_chat',
          deliveryId: 'delivery-d-2',
          outcomeId: 'outcome-d-late',
          qualifiedActivation: true,
        }),
      ],
      {
        metric: 'qualified_partner_activation_per_assigned_eligible_user',
        metricApproved: true,
        attributionWindowMs: 7 * 24 * 60 * 60 * 1000,
        windowApproved: true,
        comparablePostbacks: true,
        partnerOutcomeCoverage: { display: 'complete', agentic: 'complete' },
        matureWindowCoverage: { display: 'complete', agentic: 'complete' },
      },
    )

    expect(report.byArm.display).toMatchObject({
      eligibleUsers: 1,
      eligibleOpportunities: 2,
      qualifiedPartnerOutcomes: 1,
    })
    expect(report.lateQualifiedPartnerOutcomes).toBe(1)
    expect(report.primaryVerdict).toMatchObject({
      status: 'measurement_ready',
      display: { eligibleUsers: 1, activations: 0, rate: 0 },
    })
  })

  test('rejects events whose timestamps violate the linked event order', () => {
    const report = aggregateSupabaseFormatExperiment([
      displayEligible,
      {
        ...displayExposure,
        eventId: 'exposure-before-eligibility',
        deliveryId: 'delivery-too-early',
        occurredAt: '2026-08-31T23:59:00.000Z',
      },
      displayExposure,
      event({
        type: 'click',
        eventId: 'click-before-exposure',
        occurredAt: '2026-09-01T00:00:30.000Z',
        userId: 'user-1',
        arm: 'display',
        angle: 'database',
        surface: 'cli_chat',
        deliveryId: 'delivery-d',
        actionId: 'click-too-early',
      }),
      event({
        type: 'partner_outcome',
        eventId: 'outcome-before-exposure',
        occurredAt: '2026-09-01T00:00:45.000Z',
        userId: 'user-1',
        arm: 'display',
        angle: 'database',
        surface: 'cli_chat',
        deliveryId: 'delivery-d',
        outcomeId: 'outcome-too-early',
        qualifiedActivation: true,
      }),
    ])

    expect(report.byArm.display).toMatchObject({
      eligibleOpportunities: 1,
      exposures: 1,
      clicks: 0,
      partnerOutcomes: 0,
      qualifiedPartnerOutcomes: 0,
    })
    expect(report.rejected).toEqual({
      malformed: 3,
      duplicate: 0,
      assignmentMismatch: 0,
      orphaned: 0,
    })
  })

  test('does not count a Sep 6 outcome caused by a Sep 11 exposure', () => {
    const futureExposure = {
      ...displayExposure,
      eventId: 'future-exposure',
      occurredAt: '2026-09-11T00:00:00.000Z',
    }
    const prematureOutcome = event({
      type: 'partner_outcome',
      eventId: 'premature-outcome',
      occurredAt: '2026-09-06T00:00:00.000Z',
      userId: 'user-1',
      arm: 'display',
      angle: 'database',
      surface: 'cli_chat',
      deliveryId: 'delivery-d',
      outcomeId: 'outcome-before-cause',
      qualifiedActivation: true,
    })

    const report = aggregateSupabaseFormatExperiment(
      [prematureOutcome, futureExposure, displayEligible],
      {
        metric: 'qualified_partner_activation_per_assigned_eligible_user',
        metricApproved: true,
        attributionWindowMs: 7 * 24 * 60 * 60 * 1000,
        windowApproved: true,
        comparablePostbacks: true,
        partnerOutcomeCoverage: { display: 'complete', agentic: 'complete' },
        matureWindowCoverage: { display: 'complete', agentic: 'complete' },
      },
    )

    expect(report.byArm.display.partnerOutcomes).toBe(0)
    expect(report.primaryVerdict).toMatchObject({
      status: 'measurement_ready',
      display: { activations: 0, rate: 0 },
    })
    expect(report.rejected.malformed).toBe(1)
  })

  test('requires complete mature-window coverage for a primary verdict', () => {
    const report = aggregateSupabaseFormatExperiment(
      [displayEligible, displayExposure],
      {
        metric: 'qualified_partner_activation_per_assigned_eligible_user',
        metricApproved: true,
        attributionWindowMs: 7 * 24 * 60 * 60 * 1000,
        windowApproved: true,
        comparablePostbacks: true,
        partnerOutcomeCoverage: { display: 'complete', agentic: 'complete' },
        matureWindowCoverage: { display: 'partial', agentic: 'complete' },
      },
    )

    expect(report.primaryVerdict).toEqual({
      status: 'unavailable',
      reasons: ['display_mature_window_coverage_incomplete'],
    })
  })
})
