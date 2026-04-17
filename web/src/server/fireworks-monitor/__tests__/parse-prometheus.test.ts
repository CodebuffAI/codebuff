import { describe, expect, test } from 'bun:test'

import {
  estimateHistogramPercentile,
  findSamples,
  parsePrometheusText,
} from '../parse-prometheus'

describe('parsePrometheusText', () => {
  test('parses a sample with labels and a value', () => {
    const text = [
      '# HELP request_counter_total:sum_by_deployment Request rate',
      '# TYPE request_counter_total:sum_by_deployment gauge',
      'request_counter_total:sum_by_deployment{base_model="m",deployment="accounts/a/deployments/d1",deployment_account="a",deployment_id="d1"} 4.5',
    ].join('\n')

    const parsed = parsePrometheusText(text, 1000)

    expect(parsed.scrapedAt).toBe(1000)
    expect(parsed.samples).toHaveLength(1)
    expect(parsed.samples[0]).toEqual({
      name: 'request_counter_total:sum_by_deployment',
      labels: {
        base_model: 'm',
        deployment: 'accounts/a/deployments/d1',
        deployment_account: 'a',
        deployment_id: 'd1',
      },
      value: 4.5,
    })
  })

  test('skips comments and blank lines', () => {
    const text = [
      '# comment',
      '',
      'foo 1',
      '# another',
      'bar 2',
    ].join('\n')
    const parsed = parsePrometheusText(text)
    expect(parsed.samples.map((s) => s.name)).toEqual(['foo', 'bar'])
  })

  test('parses special numeric values', () => {
    const text = [
      'm_nan NaN',
      'm_pinf +Inf',
      'm_ninf -Inf',
    ].join('\n')
    const parsed = parsePrometheusText(text)
    expect(Number.isNaN(parsed.samples[0].value)).toBe(true)
    expect(parsed.samples[1].value).toBe(Number.POSITIVE_INFINITY)
    expect(parsed.samples[2].value).toBe(Number.NEGATIVE_INFINITY)
  })

  test('handles escaped quotes in labels', () => {
    const text = 'm{path="a\\"b",name="x"} 1'
    const parsed = parsePrometheusText(text)
    expect(parsed.samples[0].labels).toEqual({ path: 'a"b', name: 'x' })
  })

  test('ignores trailing timestamp on value', () => {
    const text = 'm{a="1"} 42 1700000000000'
    const parsed = parsePrometheusText(text)
    expect(parsed.samples[0].value).toBe(42)
  })
})

describe('findSamples', () => {
  test('filters by metric name and labels', () => {
    const parsed = parsePrometheusText(
      [
        'm{deployment="d1"} 1',
        'm{deployment="d2"} 2',
        'other{deployment="d1"} 99',
      ].join('\n'),
    )
    const found = findSamples(parsed, 'm', { deployment: 'd1' })
    expect(found).toHaveLength(1)
    expect(found[0].value).toBe(1)
  })
})

describe('estimateHistogramPercentile', () => {
  test('returns le of first bucket that meets the percentile', () => {
    const parsed = parsePrometheusText(
      [
        'h_bucket{le="10"} 10',
        'h_bucket{le="100"} 50',
        'h_bucket{le="1000"} 90',
        'h_bucket{le="+Inf"} 100',
      ].join('\n'),
    )
    const buckets = findSamples(parsed, 'h_bucket')
    expect(estimateHistogramPercentile(buckets, 0.5)).toBe(100)
    expect(estimateHistogramPercentile(buckets, 0.9)).toBe(1000)
    expect(estimateHistogramPercentile(buckets, 0.1)).toBe(10)
  })

  test('returns null if total is zero', () => {
    const parsed = parsePrometheusText(
      [
        'h_bucket{le="10"} 0',
        'h_bucket{le="+Inf"} 0',
      ].join('\n'),
    )
    expect(
      estimateHistogramPercentile(findSamples(parsed, 'h_bucket'), 0.5),
    ).toBeNull()
  })

  test('returns null when there are no buckets', () => {
    expect(estimateHistogramPercentile([], 0.5)).toBeNull()
  })
})
