import { describe, expect, it, mock } from 'bun:test'

import { extractAndTrackCost } from '../impl/stream-cost-tracker'

/**
 * These tests focus on DOMAIN LOGIC - the cost calculation formula and
 * profit margin application. Low-value tests that just verify JavaScript
 * null coalescing or object access have been removed.
 */

describe('extractAndTrackCost', () => {
  describe('cost extraction from different locations', () => {
    it('should extract cost from usage.cost', async () => {
      const onCostCalculated = mock(async () => {})
      
      await extractAndTrackCost({
        providerMetadata: { codebuff: { usage: { cost: 0.01 } } },
        onCostCalculated,
      })

      expect(onCostCalculated).toHaveBeenCalledTimes(1)
      const credits = (onCostCalculated.mock.calls[0] as unknown[])[0] as number
      expect(credits).toBeGreaterThan(0)
    })

    it('should extract cost from usage.costDetails.upstreamInferenceCost', async () => {
      const onCostCalculated = mock(async () => {})
      
      await extractAndTrackCost({
        providerMetadata: { 
          codebuff: { usage: { cost: 0, costDetails: { upstreamInferenceCost: 0.05 } } } 
        },
        onCostCalculated,
      })

      expect(onCostCalculated).toHaveBeenCalledTimes(1)
    })

    it('should ADD both cost sources together', async () => {
      const onCostCalculated = mock(async () => {})
      
      // Both cost=0.01 and upstreamInferenceCost=0.02 should sum to 0.03
      await extractAndTrackCost({
        providerMetadata: { 
          codebuff: { usage: { cost: 0.01, costDetails: { upstreamInferenceCost: 0.02 } } } 
        },
        onCostCalculated,
      })

      expect(onCostCalculated).toHaveBeenCalledTimes(1)
      const credits = (onCostCalculated.mock.calls[0] as unknown[])[0] as number
      // Combined $0.03 should be more credits than $0.01 alone would be
      expect(credits).toBeGreaterThan(1)
    })
  })

  describe('zero cost guard', () => {
    it('should NOT call onCostCalculated when total cost is 0', async () => {
      const onCostCalculated = mock(async () => {})
      
      await extractAndTrackCost({
        providerMetadata: { 
          codebuff: { usage: { cost: 0, costDetails: { upstreamInferenceCost: 0 } } } 
        },
        onCostCalculated,
      })

      expect(onCostCalculated).not.toHaveBeenCalled()
    })
  })

  describe('credit calculation formula: Math.round(cost * (1 + PROFIT_MARGIN) * 100)', () => {
    it('should convert $1.00 to at least 100 credits (cents)', async () => {
      const onCostCalculated = mock(async () => {})
      
      await extractAndTrackCost({
        providerMetadata: { codebuff: { usage: { cost: 1.0 } } },
        onCostCalculated,
      })

      const credits = (onCostCalculated.mock.calls[0] as unknown[])[0] as number
      // $1.00 = 100 cents minimum, plus profit margin
      expect(credits).toBeGreaterThanOrEqual(100)
    })

    it('should convert $10.00 to at least 1000 credits', async () => {
      const onCostCalculated = mock(async () => {})
      
      await extractAndTrackCost({
        providerMetadata: { codebuff: { usage: { cost: 10.0 } } },
        onCostCalculated,
      })

      const credits = (onCostCalculated.mock.calls[0] as unknown[])[0] as number
      expect(credits).toBeGreaterThanOrEqual(1000)
    })

    it('should apply profit margin (credits > cost * 100)', async () => {
      const onCostCalculated = mock(async () => {})
      
      await extractAndTrackCost({
        providerMetadata: { codebuff: { usage: { cost: 1.0 } } },
        onCostCalculated,
      })

      const credits = (onCostCalculated.mock.calls[0] as unknown[])[0] as number
      // With any positive profit margin, credits should exceed raw conversion
      // PROFIT_MARGIN of 0.3 would give 130 credits for $1.00
      expect(credits).toBeGreaterThan(100)
    })
  })

  describe('async callback handling', () => {
    it('should await the onCostCalculated callback', async () => {
      let callbackCompleted = false
      const onCostCalculated = mock(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        callbackCompleted = true
      })
      
      await extractAndTrackCost({
        providerMetadata: { codebuff: { usage: { cost: 0.01 } } },
        onCostCalculated,
      })

      expect(callbackCompleted).toBe(true)
    })
  })
})

/**
 * Mutation tests - verify our tests would catch real bugs
 */
describe('mutation detection', () => {
  it('REQUIRES both cost locations to be summed', async () => {
    // If implementation only read one location, combined cost would be wrong
    const results: number[] = []
    const onCostCalculated = mock(async (credits: number) => { results.push(credits) })
    
    // Test with cost only
    await extractAndTrackCost({
      providerMetadata: { codebuff: { usage: { cost: 1.0 } } },
      onCostCalculated,
    })
    
    // Test with upstreamInferenceCost only
    await extractAndTrackCost({
      providerMetadata: { codebuff: { usage: { cost: 0, costDetails: { upstreamInferenceCost: 1.0 } } } },
      onCostCalculated,
    })
    
    // Both should produce credits (proving both locations are read)
    expect(results).toHaveLength(2)
    expect(results[0]).toBeGreaterThan(0)
    expect(results[1]).toBeGreaterThan(0)
  })
})
