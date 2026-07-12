import { describe, expect, test } from 'bun:test'

import {
  evaluateCodingStrategy,
  measureRetrievalEffectiveness,
  validateContextPacket,
} from '../coding-harness'
import { isDirectOrchestratorEditEligible } from '../../types/agent-handoff'

describe('coding harness evidence contracts', () => {
  test('switches strategy after the same hypothesis fails twice', () => {
    expect(
      evaluateCodingStrategy([
        {
          hypothesisId: 'H1', hypothesis: 'x', evidence: [], filesChanged: [],
          diagnosticsBefore: ['E1'], diagnosticsAfter: ['E1'], outcome: 'unchanged',
        },
        {
          hypothesisId: 'H1', hypothesis: 'x', evidence: [], filesChanged: [],
          diagnosticsBefore: ['E1'], diagnosticsAfter: ['E1'], outcome: 'regressed',
        },
      ]).action,
    ).toBe('switch_strategy')
  })

  test('measures retrieval precision, recall, and late discovery', () => {
    expect(
      measureRetrievalEffectiveness({
        retrieved: ['a', 'b'], useful: ['a'], decisive: ['a', 'c'],
        decisiveBeforeFirstEdit: ['a'],
      }),
    ).toEqual({ precision: 0.5, recall: 0.5, lateDiscoveryRate: 0.5 })
  })

  test('requires freshness proof for confirmed context', () => {
    expect(
      validateContextPacket({
        request: 'fix x', acceptanceCriteria: [], diagnostics: [], priorAttempts: [],
        items: [{ path: 'a.ts', symbols: [], reason: 'target', relevance: 1, confidence: 'confirmed' }],
      }),
    ).toEqual(['a.ts: confirmed context requires a freshness hash.'])
  })

  test('keeps direct orchestrator edits to a narrow non-behavioral lane', () => {
    expect(
      isDirectOrchestratorEditEligible({
        fileCount: 1,
        estimatedChangedLines: 8,
        behaviorChange: false,
        publicContractChange: false,
        requiresTests: false,
        securityOrConcurrencyRisk: false,
        hasOpenFindings: false,
      }),
    ).toBe(true)
    expect(
      isDirectOrchestratorEditEligible({
        fileCount: 1,
        estimatedChangedLines: 8,
        behaviorChange: true,
        publicContractChange: false,
        requiresTests: true,
        securityOrConcurrencyRisk: false,
        hasOpenFindings: false,
      }),
    ).toBe(false)
  })
})
