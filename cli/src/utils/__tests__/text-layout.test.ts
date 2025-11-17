import { describe, test, expect } from 'bun:test'

import { computeInputLayoutMetrics } from '../text-layout'

describe('computeInputLayoutMetrics', () => {
  test('single-line content keeps height at 1 without gutter', () => {
    const metrics = computeInputLayoutMetrics({
      layoutContent: 'hello world',
      cursorProbe: 'hello world',
      cols: 40,
      maxHeight: 5,
    })

    expect(metrics.heightLines).toBe(1)
    expect(metrics.gutterEnabled).toBe(false)
  })

  test('counts leading indentation toward wrapped line width', () => {
    const metrics = computeInputLayoutMetrics({
      layoutContent: '    indent',
      cursorProbe: '    indent',
      cols: 8,
      maxHeight: 2,
    })

    expect(metrics.heightLines).toBe(2)
    expect(metrics.gutterEnabled).toBe(false)
  })

  test('adds gutter when two lines and cursor on second line', () => {
    const layoutContent = 'first line\nsecond line'
    const cursorProbe = 'first line\nsecond line'

    const metrics = computeInputLayoutMetrics({
      layoutContent,
      cursorProbe,
      cols: 40,
      maxHeight: 5,
    })

    expect(metrics.heightLines).toBe(3)
    expect(metrics.gutterEnabled).toBe(true)
  })

  test('omits gutter when maxHeight would be exceeded', () => {
    const metrics = computeInputLayoutMetrics({
      layoutContent: 'a long first line\nand a second line',
      cursorProbe: 'a long first line\nand a second line',
      cols: 80,
      maxHeight: 2,
    })

    expect(metrics.heightLines).toBe(2)
    expect(metrics.gutterEnabled).toBe(false)
  })

  test('respects a minimum height constraint', () => {
    const metrics = computeInputLayoutMetrics({
      layoutContent: 'short',
      cursorProbe: 'short',
      cols: 40,
      maxHeight: 5,
      minHeight: 3,
    })

    expect(metrics.heightLines).toBe(3)
    expect(metrics.gutterEnabled).toBe(false)
  })

  test('caps the minimum height at the max height', () => {
    const metrics = computeInputLayoutMetrics({
      layoutContent: 'tiny',
      cursorProbe: 'tiny',
      cols: 40,
      maxHeight: 2,
      minHeight: 5,
    })

    expect(metrics.heightLines).toBe(2)
    expect(metrics.gutterEnabled).toBe(false)
  })
})
