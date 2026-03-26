import { describe, expect, it } from 'bun:test'

import {
  formatCriteriaForPrompt,
  getCriteriaForLevel,
  maybePromoteCriteria,
} from '../criteria'

import type { QualityCriteria } from '../criteria'

function makeCriteria(
  level: number,
  threshold = 8.0,
  window = 10,
): QualityCriteria {
  return {
    level,
    criteria: getCriteriaForLevel(level),
    promotionThreshold: threshold,
    promotionWindow: window,
  }
}

describe('getCriteriaForLevel', () => {
  it('returns only L1 criteria at level 1', () => {
    const criteria = getCriteriaForLevel(1)
    expect(criteria).toHaveLength(3)
    expect(criteria.map((c) => c.name)).toEqual([
      'Builds & Compiles',
      'Existing Tests Pass',
      'Basic Completeness',
    ])
  })

  it('accumulates criteria up to level 3', () => {
    const criteria = getCriteriaForLevel(3)
    expect(criteria.map((c) => c.name)).toEqual([
      'Builds & Compiles',
      'Existing Tests Pass',
      'Basic Completeness',
      'Feature Works E2E',
      'Logs & Observability',
      'Edge Cases & Error States',
      'UI/UX Verification',
    ])
  })

  it('includes all criteria at level 5', () => {
    const criteria = getCriteriaForLevel(5)
    expect(criteria).toHaveLength(10)
    expect(criteria[criteria.length - 1].name).toBe('Production Readiness')
  })

  it('caps at level 5 even if higher number passed', () => {
    const criteria = getCriteriaForLevel(10)
    expect(criteria).toHaveLength(10)
  })
})

describe('maybePromoteCriteria', () => {
  it('promotes when avg above threshold over window', () => {
    const criteria = makeCriteria(1, 8.0, 5)
    const scores = [8.5, 9.0, 8.2, 8.8, 8.6]
    const newLevel = maybePromoteCriteria(criteria, scores)
    expect(newLevel).toBe(2)
  })

  it('does NOT promote when avg below threshold', () => {
    const criteria = makeCriteria(1, 8.0, 5)
    const scores = [7.0, 6.5, 8.0, 7.5, 7.0]
    const newLevel = maybePromoteCriteria(criteria, scores)
    expect(newLevel).toBe(1)
  })

  it('does NOT promote when already at max level (5)', () => {
    const criteria = makeCriteria(5, 8.0, 3)
    const scores = [9.0, 9.5, 9.0]
    const newLevel = maybePromoteCriteria(criteria, scores)
    expect(newLevel).toBe(5)
  })

  it('does NOT promote when fewer iterations than window size', () => {
    const criteria = makeCriteria(1, 8.0, 10)
    const scores = [9.0, 9.5, 9.0]
    const newLevel = maybePromoteCriteria(criteria, scores)
    expect(newLevel).toBe(1)
  })

  it('uses only the last N scores in the window', () => {
    const criteria = makeCriteria(2, 8.0, 3)
    const scores = [3.0, 4.0, 5.0, 8.5, 9.0, 8.5]
    const newLevel = maybePromoteCriteria(criteria, scores)
    expect(newLevel).toBe(3)
  })
})

describe('formatCriteriaForPrompt', () => {
  it('includes level and E2E-focused criteria names', () => {
    const criteria = makeCriteria(2)
    const prompt = formatCriteriaForPrompt(criteria)
    expect(prompt).toContain('Level 2/5')
    expect(prompt).toContain('Builds & Compiles')
    expect(prompt).toContain('Feature Works E2E')
  })

  it('includes weights', () => {
    const criteria = makeCriteria(1)
    const prompt = formatCriteriaForPrompt(criteria)
    expect(prompt).toContain('weight: 3')
    expect(prompt).toContain('weight: 2')
  })

  it('instructs E2E verification', () => {
    const criteria = makeCriteria(1)
    const prompt = formatCriteriaForPrompt(criteria)
    expect(prompt).toContain('MUST verify')
    expect(prompt).toContain('E2E testing')
  })
})
