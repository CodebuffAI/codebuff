import { describe, it, expect } from 'bun:test'

import { createStreamUsageTracker } from './stream-usage-tracker'

describe('createStreamUsageTracker', () => {
  describe('update', () => {
    it('should update basic token counts', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      })

      const usage = tracker.getUsage()
      expect(usage.inputTokens).toBe(100)
      expect(usage.outputTokens).toBe(50)
      expect(usage.totalTokens).toBe(150)
    })

    it('should handle null values', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
      })

      const usage = tracker.getUsage()
      expect(usage.inputTokens).toBeUndefined()
      expect(usage.outputTokens).toBeUndefined()
      expect(usage.totalTokens).toBeUndefined()
    })

    it('should handle undefined values', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({})

      const usage = tracker.getUsage()
      expect(usage.inputTokens).toBeUndefined()
      expect(usage.outputTokens).toBeUndefined()
      expect(usage.totalTokens).toBeUndefined()
    })

    it('should update reasoning tokens from completion_tokens_details', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: 100,
        completion_tokens: 150,
        total_tokens: 250,
        completion_tokens_details: {
          reasoning_tokens: 50,
        },
      })

      const usage = tracker.getUsage()
      expect(usage.reasoningTokens).toBe(50)
    })

    it('should update accepted prediction tokens', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        completion_tokens_details: {
          accepted_prediction_tokens: 25,
        },
      })

      const details = tracker.getCompletionTokensDetails()
      expect(details.acceptedPredictionTokens).toBe(25)
    })

    it('should update rejected prediction tokens', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        completion_tokens_details: {
          rejected_prediction_tokens: 10,
        },
      })

      const details = tracker.getCompletionTokensDetails()
      expect(details.rejectedPredictionTokens).toBe(10)
    })

    it('should update cached tokens from prompt_tokens_details', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: 100,
        prompt_tokens_details: {
          cached_tokens: 75,
        },
      })

      const usage = tracker.getUsage()
      expect(usage.cachedInputTokens).toBe(75)
    })

    it('should handle all fields at once', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
        prompt_tokens_details: {
          cached_tokens: 50,
        },
        completion_tokens_details: {
          reasoning_tokens: 75,
          accepted_prediction_tokens: 25,
          rejected_prediction_tokens: 10,
        },
      })

      const usage = tracker.getUsage()
      expect(usage.inputTokens).toBe(100)
      expect(usage.outputTokens).toBe(200)
      expect(usage.totalTokens).toBe(300)
      expect(usage.reasoningTokens).toBe(75)
      expect(usage.cachedInputTokens).toBe(50)

      const details = tracker.getCompletionTokensDetails()
      expect(details.reasoningTokens).toBe(75)
      expect(details.acceptedPredictionTokens).toBe(25)
      expect(details.rejectedPredictionTokens).toBe(10)
    })

    it('should overwrite previous values on subsequent updates', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      })

      tracker.update({
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
      })

      const usage = tracker.getUsage()
      expect(usage.inputTokens).toBe(200)
      expect(usage.outputTokens).toBe(100)
      expect(usage.totalTokens).toBe(300)
    })

    it('should preserve detail fields not present in later updates', () => {
      const tracker = createStreamUsageTracker()
      
      // First update has reasoning tokens
      tracker.update({
        prompt_tokens: 100,
        completion_tokens_details: {
          reasoning_tokens: 50,
        },
      })

      // Second update doesn't have completion_tokens_details
      tracker.update({
        prompt_tokens: 150,
      })

      // reasoning_tokens should be preserved
      const usage = tracker.getUsage()
      expect(usage.reasoningTokens).toBe(50)
      expect(usage.inputTokens).toBe(150)
    })

    it('should handle null completion_tokens_details', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: 100,
        completion_tokens_details: null,
      })

      const usage = tracker.getUsage()
      expect(usage.reasoningTokens).toBeUndefined()
    })

    it('should handle null prompt_tokens_details', () => {
      const tracker = createStreamUsageTracker()
      
      tracker.update({
        prompt_tokens: 100,
        prompt_tokens_details: null,
      })

      const usage = tracker.getUsage()
      expect(usage.cachedInputTokens).toBeUndefined()
    })
  })

  describe('getUsage', () => {
    it('should return undefined for all fields initially', () => {
      const tracker = createStreamUsageTracker()
      const usage = tracker.getUsage()

      expect(usage.inputTokens).toBeUndefined()
      expect(usage.outputTokens).toBeUndefined()
      expect(usage.totalTokens).toBeUndefined()
      expect(usage.reasoningTokens).toBeUndefined()
      expect(usage.cachedInputTokens).toBeUndefined()
    })

    it('should return LanguageModelV2Usage compatible object', () => {
      const tracker = createStreamUsageTracker()
      tracker.update({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      })

      const usage = tracker.getUsage()
      
      // Should have the expected shape
      expect(usage).toHaveProperty('inputTokens')
      expect(usage).toHaveProperty('outputTokens')
      expect(usage).toHaveProperty('totalTokens')
      expect(usage).toHaveProperty('reasoningTokens')
      expect(usage).toHaveProperty('cachedInputTokens')
    })
  })

  describe('getCompletionTokensDetails', () => {
    it('should return undefined for all fields initially', () => {
      const tracker = createStreamUsageTracker()
      const details = tracker.getCompletionTokensDetails()

      expect(details.reasoningTokens).toBeUndefined()
      expect(details.acceptedPredictionTokens).toBeUndefined()
      expect(details.rejectedPredictionTokens).toBeUndefined()
    })

    it('should return all completion token details', () => {
      const tracker = createStreamUsageTracker()
      tracker.update({
        completion_tokens_details: {
          reasoning_tokens: 100,
          accepted_prediction_tokens: 50,
          rejected_prediction_tokens: 25,
        },
      })

      const details = tracker.getCompletionTokensDetails()
      expect(details).toEqual({
        reasoningTokens: 100,
        acceptedPredictionTokens: 50,
        rejectedPredictionTokens: 25,
      })
    })

    it('should handle partial completion token details', () => {
      const tracker = createStreamUsageTracker()
      tracker.update({
        completion_tokens_details: {
          reasoning_tokens: 100,
          // Other fields not present
        },
      })

      const details = tracker.getCompletionTokensDetails()
      expect(details.reasoningTokens).toBe(100)
      expect(details.acceptedPredictionTokens).toBeUndefined()
      expect(details.rejectedPredictionTokens).toBeUndefined()
    })
  })

  describe('zero values', () => {
    it('should handle zero token counts correctly', () => {
      const tracker = createStreamUsageTracker()
      tracker.update({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      })

      const usage = tracker.getUsage()
      expect(usage.inputTokens).toBe(0)
      expect(usage.outputTokens).toBe(0)
      expect(usage.totalTokens).toBe(0)
    })

    it('should handle zero in details', () => {
      const tracker = createStreamUsageTracker()
      tracker.update({
        completion_tokens_details: {
          reasoning_tokens: 0,
          accepted_prediction_tokens: 0,
          rejected_prediction_tokens: 0,
        },
        prompt_tokens_details: {
          cached_tokens: 0,
        },
      })

      const usage = tracker.getUsage()
      expect(usage.reasoningTokens).toBe(0)
      expect(usage.cachedInputTokens).toBe(0)

      const details = tracker.getCompletionTokensDetails()
      expect(details.acceptedPredictionTokens).toBe(0)
      expect(details.rejectedPredictionTokens).toBe(0)
    })
  })
})
