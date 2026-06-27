import { getInitialAgentState } from '@codebuff/common/types/session-state'
import { describe, expect, it } from 'bun:test'

import type { AgentState } from '@codebuff/common/types/session-state'

import {
  initBudgetFromTemplate,
  checkBudgetExceeded,
  type BudgetCapSource,
} from '../util/budget-enforcement'

/**
 * P1-5 budget enforcement unit tests.
 *
 * These test the two pure helpers extracted from run-agent-step.ts:
 * - initBudgetFromTemplate: lazy-init caps from template onto agentState
 * - checkBudgetExceeded: post-accumulation check that produces the
 *   budget-exceeded system message
 *
 * BudgetCheckResult is a discriminated union ({ exceeded: false } | { exceeded:
 * true; reason; message }). Tests use `if (result.exceeded)` for type narrowing
 * — TS narrows to the exceeded variant inside the block, so .reason/.message are
 * accessible without non-null assertions.
 */
describe('Budget Enforcement (P1-5)', () => {
  describe('initBudgetFromTemplate', () => {
    it('should return agentState unchanged when template declares no caps', () => {
      const agentState = getInitialAgentState()
      const template: BudgetCapSource = {}

      const result = initBudgetFromTemplate(agentState, template)

      expect(result).toBe(agentState)
      expect(result.maxCostCents).toBeUndefined()
      expect(result.maxTokensPerTurn).toBeUndefined()
    })

    it('should init maxCostCents from template when agentState has no caps', () => {
      const agentState = getInitialAgentState()
      const template: BudgetCapSource = { maxCostCents: 500 }

      const result = initBudgetFromTemplate(agentState, template)

      expect(result.maxCostCents).toBe(500)
      expect(result.maxTokensPerTurn).toBeUndefined()
    })

    it('should init maxTokensPerTurn from template when agentState has no caps', () => {
      const agentState = getInitialAgentState()
      const template: BudgetCapSource = { maxTokensPerTurn: 100_000 }

      const result = initBudgetFromTemplate(agentState, template)

      expect(result.maxCostCents).toBeUndefined()
      expect(result.maxTokensPerTurn).toBe(100_000)
    })

    it('should init both caps when template declares both', () => {
      const agentState = getInitialAgentState()
      const template: BudgetCapSource = {
        maxCostCents: 500,
        maxTokensPerTurn: 100_000,
      }

      const result = initBudgetFromTemplate(agentState, template)

      expect(result.maxCostCents).toBe(500)
      expect(result.maxTokensPerTurn).toBe(100_000)
    })

    it('should be idempotent: skip init if maxCostCents already set', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 200,
      }
      const template: BudgetCapSource = { maxCostCents: 500 }

      const result = initBudgetFromTemplate(agentState, template)

      // Existing cap preserved, not overwritten
      expect(result).toBe(agentState)
      expect(result.maxCostCents).toBe(200)
    })

    it('should be idempotent: skip init if maxTokensPerTurn already set', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxTokensPerTurn: 50_000,
      }
      const template: BudgetCapSource = { maxTokensPerTurn: 100_000 }

      const result = initBudgetFromTemplate(agentState, template)

      expect(result).toBe(agentState)
      expect(result.maxTokensPerTurn).toBe(50_000)
    })

    it('should not mutate the input agentState (immutability)', () => {
      const agentState = getInitialAgentState()
      const template: BudgetCapSource = { maxCostCents: 500 }

      initBudgetFromTemplate(agentState, template)

      // Original unchanged — init returns a new object
      expect(agentState.maxCostCents).toBeUndefined()
    })
  })

  describe('checkBudgetExceeded — no caps', () => {
    it('should not exceed when no caps are set', () => {
      const agentState = getInitialAgentState()

      const result = checkBudgetExceeded(agentState, 50_000)

      expect(result.exceeded).toBe(false)
    })

    it('should not exceed regardless of cost/tokens when no caps are set', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        creditsUsed: 1_000_000,
      }

      const result = checkBudgetExceeded(agentState, 1_000_000)

      expect(result.exceeded).toBe(false)
    })
  })

  describe('checkBudgetExceeded — cost cap', () => {
    it('should not exceed when cost is below cap', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 500,
        creditsUsed: 499,
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(false)
    })

    it('should exceed when cost equals cap (>= check)', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 500,
        creditsUsed: 500,
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.reason).toBe('cost')
        expect(result.message).toContain('cost budget exceeded')
        expect(result.message).toContain('$5.00 / $5.00')
      }
    })

    it('should exceed when cost exceeds cap', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 500,
        creditsUsed: 750,
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.reason).toBe('cost')
        expect(result.message).toContain('$7.50 / $5.00')
      }
    })

    it('should format cost as dollars (cents / 100)', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 1250, // $12.50
        creditsUsed: 1250,
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.message).toContain('$12.50 / $12.50')
      }
    })

    it('should include resume hint in the message', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 100,
        creditsUsed: 150,
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.message).toContain(
          'The task may be incomplete — resume on the next turn if needed.',
        )
      }
    })
  })

  describe('checkBudgetExceeded — token cap', () => {
    it('should not exceed when tokens equal cap (strict > check)', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxTokensPerTurn: 100_000,
      }

      const result = checkBudgetExceeded(agentState, 100_000)

      expect(result.exceeded).toBe(false)
    })

    it('should not exceed when tokens are below cap', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxTokensPerTurn: 100_000,
      }

      const result = checkBudgetExceeded(agentState, 99_999)

      expect(result.exceeded).toBe(false)
    })

    it('should exceed when tokens exceed cap', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxTokensPerTurn: 100_000,
      }

      const result = checkBudgetExceeded(agentState, 100_001)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.reason).toBe('tokens')
        expect(result.message).toContain('per-turn token budget exceeded')
        expect(result.message).toContain('100001 / 100000 input tokens')
      }
    })

    it('should include resume hint in the message', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxTokensPerTurn: 50_000,
      }

      const result = checkBudgetExceeded(agentState, 75_000)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.message).toContain(
          'The task may be incomplete — resume on the next turn if needed.',
        )
      }
    })
  })

  describe('checkBudgetExceeded — both caps', () => {
    it('should prefer cost reason when both caps are exceeded', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 100,
        maxTokensPerTurn: 50_000,
        creditsUsed: 150,
      }

      const result = checkBudgetExceeded(agentState, 75_000)

      // Cost takes precedence in the reported reason
      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.reason).toBe('cost')
        expect(result.message).toContain('cost budget exceeded')
      }
    })

    it('should report token reason when only token cap is exceeded', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 1_000,
        maxTokensPerTurn: 50_000,
        creditsUsed: 100, // under cost cap
      }

      const result = checkBudgetExceeded(agentState, 75_000)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.reason).toBe('tokens')
        expect(result.message).toContain('per-turn token budget exceeded')
      }
    })

    it('should report cost reason when only cost cap is exceeded', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 1_000,
        maxTokensPerTurn: 50_000,
        creditsUsed: 1_200,
      }

      const result = checkBudgetExceeded(agentState, 10_000) // under token cap

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.reason).toBe('cost')
        expect(result.message).toContain('cost budget exceeded')
      }
    })
  })

  describe('checkBudgetExceeded — message contract', () => {
    it('should produce a non-empty message when exceeded', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 10,
        creditsUsed: 20,
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(typeof result.message).toBe('string')
        expect(result.message.length).toBeGreaterThan(0)
      }
    })

    it('should not mutate the input agentState', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 10,
        creditsUsed: 20,
      }
      const originalCredits = agentState.creditsUsed

      checkBudgetExceeded(agentState, 0)

      expect(agentState.creditsUsed).toBe(originalCredits)
    })
  })

  describe('checkBudgetExceeded — pre-LLM-call check (P1-5j finding #1)', () => {
    // The pre-LLM-call check passes stepTotalInputTokens=0 (no step has run
    // yet). Only the cumulative cost cap can trigger; the per-step token cap
    // never triggers with 0 tokens (strict > check). This catches a budget
    // already exceeded by a prior step (e.g. an n-param path that accumulates
    // cost without checking the budget), preventing one extra LLM call past
    // the cap.
    it('should exceed when cost was already exceeded from a prior step (0 step tokens)', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 500,
        creditsUsed: 600, // already past cap from prior step
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        expect(result.reason).toBe('cost')
      }
    })

    it('should not exceed when cost is below cap (0 step tokens)', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 500,
        creditsUsed: 400, // under cap
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(false)
    })

    it('should not exceed from token cap alone with 0 step tokens (per-step cap)', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxTokensPerTurn: 50_000,
      }

      // 0 step tokens can't exceed a per-step token cap (strict > check)
      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(false)
    })

    it('should still exceed when both cost cap exceeded and 0 step tokens', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        maxCostCents: 100,
        maxTokensPerTurn: 50_000,
        creditsUsed: 150, // cost already exceeded
      }

      const result = checkBudgetExceeded(agentState, 0)

      expect(result.exceeded).toBe(true)
      if (result.exceeded) {
        // Cost takes precedence even when token cap is also set
        expect(result.reason).toBe('cost')
      }
    })
  })
})
