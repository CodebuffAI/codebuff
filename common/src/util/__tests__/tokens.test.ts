import { describe, expect, it } from 'bun:test'

import { formatTokens, freshInputTokens, totalTokens } from '../tokens'

// Synthetic, but shaped like the real thing: cache-heavy, trillion-scale, with
// a small completion tail. Deliberately not measured figures — this file is
// published to the public mirror by scripts/sync-public-repo.sh.
const day = {
  inputTokens: 800_000_000_000,
  cacheReadTokens: 776_000_000_000,
  outputTokens: 3_200_000_000,
}

describe('totalTokens', () => {
  it('adds prompt and completion tokens', () => {
    expect(totalTokens(day)).toBe(803_200_000_000)
  })

  it('does NOT add cache reads back in — prompt_tokens already includes them', () => {
    // The defect this replaced: adding cacheReadTokens on top nearly doubles
    // the total on a cache-heavy workload.
    const doubleCounted =
      day.inputTokens + day.cacheReadTokens + day.outputTokens
    expect(doubleCounted).toBe(1_579_200_000_000)
    expect(totalTokens(day)).toBeLessThan(doubleCounted / 1.9)
  })
})

describe('freshInputTokens', () => {
  it('reports prefill as the non-cached remainder', () => {
    expect(freshInputTokens(day)).toBe(24_000_000_000)
  })

  it('never goes negative if a provider over-reports cache reads', () => {
    expect(freshInputTokens({ inputTokens: 100, cacheReadTokens: 150 })).toBe(0)
  })
})

describe('formatTokens', () => {
  it('abbreviates from thousands to trillions', () => {
    expect(formatTokens(5_949_522_000_000)).toBe('5.95T')
    expect(formatTokens(803_200_000_000)).toBe('803.20B')
    expect(formatTokens(23_714_520_535)).toBe('23.71B')
    expect(formatTokens(177_136_656)).toBe('177.1M')
    expect(formatTokens(41_882)).toBe('41.9K')
  })

  it('keeps counts below 10,000 exact, where a reader can act on them', () => {
    expect(formatTokens(8_412)).toBe('8,412')
    expect(formatTokens(24)).toBe('24')
  })

  it('renders nothing-to-report as 0 rather than a bogus unit', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(-1)).toBe('0')
    expect(formatTokens(Number.NaN)).toBe('0')
  })
})
