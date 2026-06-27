import {
  createTestAgentRuntimeParams,
  testFileContext,
} from '@codebuff/common/testing/fixtures/agent-runtime'
import {
  getInitialAgentState,
  getInitialSessionState,
} from '@codebuff/common/types/session-state'
import { describe, expect, it } from 'bun:test'

import type { AgentState } from '@codebuff/common/types/session-state'
import type { CacheDebugUsageData } from '@codebuff/common/types/contracts/llm'

const mockFileContext = testFileContext

/**
 * Replicate the step-local accumulation pattern from run-agent-step.ts:
 * stepCacheInputTokens / stepCacheTotalInputTokens accumulate via the
 * onCacheDebugUsageReceived callback, then are applied once on the
 * post-spread agentState (mirroring stepCreditsUsed).
 *
 * This factory lets us unit-test the accumulation contract without spinning
 * up the full promptAiSdk pipeline.
 */
function createStepAccumulator(initialState: AgentState) {
  let stepCacheInputTokens = 0
  let stepCacheTotalInputTokens = 0

  const onCacheDebugUsageReceived = (usage: CacheDebugUsageData) => {
    stepCacheInputTokens += usage.cachedInputTokens ?? 0
    stepCacheTotalInputTokens += usage.inputTokens ?? 0
  }

  const applyToState = (): AgentState => ({
    ...initialState,
    cacheInputTokens: initialState.cacheInputTokens + stepCacheInputTokens,
    cacheTotalInputTokens:
      initialState.cacheTotalInputTokens + stepCacheTotalInputTokens,
  })

  return { onCacheDebugUsageReceived, applyToState }
}

describe('Cache Token Aggregation (P0-3)', () => {
  describe('AgentState initialization', () => {
    it('should initialize cacheInputTokens and cacheTotalInputTokens to 0', () => {
      const agentState = getInitialAgentState()

      expect(agentState.cacheInputTokens).toBe(0)
      expect(agentState.cacheTotalInputTokens).toBe(0)
    })

    it('should initialize cache fields in getInitialSessionState', () => {
      const sessionState = getInitialSessionState(mockFileContext)

      expect(sessionState.mainAgentState.cacheInputTokens).toBe(0)
      expect(sessionState.mainAgentState.cacheTotalInputTokens).toBe(0)
    })

    it('should have cache fields as numbers', () => {
      const agentState = getInitialAgentState()

      expect(typeof agentState.cacheInputTokens).toBe('number')
      expect(typeof agentState.cacheTotalInputTokens).toBe('number')
    })
  })

  describe('Step-local accumulation (mirrors stepCreditsUsed pattern)', () => {
    it('should accumulate cache tokens from multiple usage callbacks', () => {
      const initialState = getInitialAgentState()
      const { onCacheDebugUsageReceived, applyToState } =
        createStepAccumulator(initialState)

      // Simulate multiple LLM calls in a single step
      onCacheDebugUsageReceived({
        inputTokens: 1000,
        cachedInputTokens: 800,
        outputTokens: 200,
        totalTokens: 1200,
      })
      onCacheDebugUsageReceived({
        inputTokens: 500,
        cachedInputTokens: 300,
        outputTokens: 100,
        totalTokens: 600,
      })

      const result = applyToState()

      expect(result.cacheInputTokens).toBe(1100) // 800 + 300
      expect(result.cacheTotalInputTokens).toBe(1500) // 1000 + 500
    })

    it('should handle zero cachedInputTokens (no cache hits this call)', () => {
      const initialState = getInitialAgentState()
      const { onCacheDebugUsageReceived, applyToState } =
        createStepAccumulator(initialState)

      // cachedInputTokens: 0 simulates a call with no cache hits (e.g. first
      // turn or cache miss). The ?? 0 in the accumulator also guards against
      // runtime undefined from providers that don't populate this field.
      onCacheDebugUsageReceived({
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 200,
        totalTokens: 1200,
      })

      const result = applyToState()

      expect(result.cacheInputTokens).toBe(0)
      expect(result.cacheTotalInputTokens).toBe(1000)
    })

    it('should handle zero inputTokens (edge case)', () => {
      const initialState = getInitialAgentState()
      const { onCacheDebugUsageReceived, applyToState } =
        createStepAccumulator(initialState)

      onCacheDebugUsageReceived({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 200,
        totalTokens: 200,
      })

      const result = applyToState()

      expect(result.cacheInputTokens).toBe(0)
      expect(result.cacheTotalInputTokens).toBe(0)
    })

    it('should accumulate across multiple steps (cumulative)', () => {
      // Step 1
      let agentState = getInitialAgentState()
      let step1 = createStepAccumulator(agentState)
      step1.onCacheDebugUsageReceived({
        inputTokens: 1000,
        cachedInputTokens: 600,
        outputTokens: 100,
        totalTokens: 1100,
      })
      agentState = step1.applyToState()

      // Step 2 (starts from the previous step's accumulated state)
      let step2 = createStepAccumulator(agentState)
      step2.onCacheDebugUsageReceived({
        inputTokens: 800,
        cachedInputTokens: 700,
        outputTokens: 50,
        totalTokens: 850,
      })
      agentState = step2.applyToState()

      expect(agentState.cacheInputTokens).toBe(1300) // 600 + 700
      expect(agentState.cacheTotalInputTokens).toBe(1800) // 1000 + 800
    })

    it('should apply accumulated tokens on post-spread agentState (not mutate pre-spread)', () => {
      const initialState = getInitialAgentState()
      const originalInputTokens = initialState.cacheInputTokens
      const originalTotalTokens = initialState.cacheTotalInputTokens

      const { onCacheDebugUsageReceived, applyToState } =
        createStepAccumulator(initialState)

      onCacheDebugUsageReceived({
        inputTokens: 500,
        cachedInputTokens: 400,
        outputTokens: 100,
        totalTokens: 600,
      })

      const result = applyToState()

      // The original (pre-spread) state must be untouched — this is the
      // stale-closure avoidance invariant (C2.3) that stepCreditsUsed also
      // satisfies.
      expect(initialState.cacheInputTokens).toBe(originalInputTokens)
      expect(initialState.cacheTotalInputTokens).toBe(originalTotalTokens)

      // The returned (post-spread) state has the accumulated totals.
      expect(result.cacheInputTokens).toBe(400)
      expect(result.cacheTotalInputTokens).toBe(500)
      expect(result).not.toBe(initialState)
    })

    it('should handle zero usage (no-op step)', () => {
      const initialState = getInitialAgentState()
      const { applyToState } = createStepAccumulator(initialState)

      const result = applyToState()

      expect(result.cacheInputTokens).toBe(0)
      expect(result.cacheTotalInputTokens).toBe(0)
    })
  })

  describe('Cache hit-rate computation', () => {
    it('should compute hit rate as cacheInputTokens / cacheTotalInputTokens', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        cacheInputTokens: 800,
        cacheTotalInputTokens: 1000,
      }

      const hitRate =
        agentState.cacheTotalInputTokens > 0
          ? agentState.cacheInputTokens / agentState.cacheTotalInputTokens
          : undefined

      expect(hitRate).toBe(0.8)
    })

    it('should return undefined when totalInputTokens is 0 (no data)', () => {
      const agentState = getInitialAgentState()

      const hitRate =
        agentState.cacheTotalInputTokens > 0
          ? agentState.cacheInputTokens / agentState.cacheTotalInputTokens
          : undefined

      expect(hitRate).toBeUndefined()
    })

    it('should return 1 when all input tokens were cache hits', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        cacheInputTokens: 1000,
        cacheTotalInputTokens: 1000,
      }

      const hitRate =
        agentState.cacheTotalInputTokens > 0
          ? agentState.cacheInputTokens / agentState.cacheTotalInputTokens
          : undefined

      expect(hitRate).toBe(1)
    })

    it('should return 0 when no input tokens were cache hits', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        cacheInputTokens: 0,
        cacheTotalInputTokens: 1000,
      }

      const hitRate =
        agentState.cacheTotalInputTokens > 0
          ? agentState.cacheInputTokens / agentState.cacheTotalInputTokens
          : undefined

      expect(hitRate).toBe(0)
    })

    it('should format as percentage in display (0-100)', () => {
      const agentState: AgentState = {
        ...getInitialAgentState(),
        cacheInputTokens: 750,
        cacheTotalInputTokens: 1000,
      }

      const hitRate =
        agentState.cacheTotalInputTokens > 0
          ? agentState.cacheInputTokens / agentState.cacheTotalInputTokens
          : undefined

      const pct = hitRate !== undefined ? Math.round(hitRate * 100) : undefined

      expect(pct).toBe(75)
    })
  })

  describe('AgentState type completeness', () => {
    it('should include cacheInputTokens and cacheTotalInputTokens on all AgentState objects', () => {
      const sessionState = getInitialSessionState(mockFileContext)
      const agentState = sessionState.mainAgentState

      expect(agentState).toHaveProperty('cacheInputTokens')
      expect(agentState).toHaveProperty('cacheTotalInputTokens')
    })

    it('should construct a valid AgentState with cache fields', () => {
      const agentState: AgentState = {
        agentId: 'test-agent',
        agentType: 'test-agent',
        agentContext: {},
        ancestorRunIds: [],
        subagents: [],
        childRunIds: [],
        messageHistory: [],
        stepsRemaining: 10,
        creditsUsed: 0,
        directCreditsUsed: 0,
        cacheInputTokens: 500,
        cacheTotalInputTokens: 1000,
        systemPrompt: 'Test',
        toolDefinitions: {},
        contextTokenCount: 0,
      }

      expect(agentState.cacheInputTokens).toBe(500)
      expect(agentState.cacheTotalInputTokens).toBe(1000)
    })
  })
})
