import { describe, expect, test } from 'bun:test'

import { createCloudTurnMetrics, readCloudTurnMetrics } from './turn-metrics'

const request = (
  totalTokens: number,
  extra: Partial<{
    isRoot: boolean
    reasoningOutputTokens: number
  }> = {},
) => ({
  inputTokens: totalTokens - 10,
  cachedInputTokens: 5,
  outputTokens: 10,
  totalTokens,
  isRoot: true,
  ...extra,
})

describe('createCloudTurnMetrics', () => {
  test('nothing to report until something is measured', () => {
    const metrics = createCloudTurnMetrics({ windowTokens: 1000 })
    expect(metrics.take()).toBeNull()
  })

  test('sums usage over every request and takes context from root requests only', () => {
    const metrics = createCloudTurnMetrics({
      windowTokens: 1000,
      compactionThresholdTokens: 800,
    })
    metrics.usage(request(100, { reasoningOutputTokens: 4 }))
    metrics.usage(request(50, { isRoot: false, reasoningOutputTokens: 1 }))
    expect(metrics.take()).toEqual({
      usage: {
        inputTokens: 130,
        cachedInputTokens: 10,
        outputTokens: 20,
        reasoningOutputTokens: 5,
        totalTokens: 150,
      },
      context: { usedTokens: 100, windowTokens: 1000, compactionThresholdTokens: 800 },
      compactions: [],
    })
    // Taken: no new row until something changes.
    expect(metrics.take()).toBeNull()
  })

  test('reasoning is reported only when every request reported it', () => {
    const metrics = createCloudTurnMetrics({})
    metrics.usage(request(100, { reasoningOutputTokens: 4 }))
    metrics.usage(request(100))
    expect(metrics.take()?.usage?.reasoningOutputTokens).toBeUndefined()
  })

  test('a non-root request alone never reports context as zero', () => {
    const metrics = createCloudTurnMetrics({ windowTokens: 1000 })
    metrics.usage(request(50, { isRoot: false }))
    expect(metrics.take()?.context).toBeUndefined()
  })

  test('starts from the context a resumed state carries', () => {
    const metrics = createCloudTurnMetrics({ windowTokens: 1000, usedTokens: 300 })
    metrics.usageIncomplete()
    expect(metrics.take()).toEqual({
      usageIncomplete: true,
      context: { usedTokens: 300, windowTokens: 1000 },
      compactions: [],
    })
  })

  test('a compaction moves the context and its line, and is listed', () => {
    const metrics = createCloudTurnMetrics({ windowTokens: 1000, usedTokens: 900 })
    metrics.compaction({
      trigger: 'context_limit',
      thresholdTokens: 700,
      preTokens: 900,
      postTokens: 200,
      durationMs: 12,
      summary: 'never forwarded',
    })
    expect(metrics.take()).toEqual({
      context: { usedTokens: 200, windowTokens: 1000, compactionThresholdTokens: 700 },
      compactions: [
        { trigger: 'context_limit', preTokens: 900, postTokens: 200, durationMs: 12 },
      ],
    })
  })

  test('cost comes from the finish event in credits; a missing cost stays unknown', () => {
    const metrics = createCloudTurnMetrics({})
    metrics.finish(undefined)
    expect(metrics.take()).toBeNull()
    metrics.finish(25)
    expect(metrics.take()?.costUsd).toBe(0.25)
  })
})

describe('readCloudTurnMetrics', () => {
  test('reads only metrics rows with an object payload', () => {
    expect(readCloudTurnMetrics('metrics', { usageIncomplete: true })).toEqual({
      usageIncomplete: true,
    })
    expect(readCloudTurnMetrics('chunk', { usageIncomplete: true })).toBeNull()
    expect(readCloudTurnMetrics('metrics', 'text')).toBeNull()
    expect(readCloudTurnMetrics('metrics', [])).toBeNull()
    expect(readCloudTurnMetrics('metrics', null)).toBeNull()
  })
})
