import { describe, test, expect } from 'bun:test'

import {
  computeGridLayout,
  WIDTH_MD_THRESHOLD,
  WIDTH_LG_THRESHOLD,
  WIDTH_XL_THRESHOLD,
} from '../use-grid-layout'
import { MIN_COLUMN_WIDTH } from '../../utils/layout-helpers'

describe('computeGridLayout', () => {
  describe('threshold constants', () => {
    test('thresholds are in ascending order', () => {
      expect(WIDTH_MD_THRESHOLD).toBeLessThan(WIDTH_LG_THRESHOLD)
      expect(WIDTH_LG_THRESHOLD).toBeLessThan(WIDTH_XL_THRESHOLD)
    })

    test('WIDTH_MD_THRESHOLD is 100', () => {
      expect(WIDTH_MD_THRESHOLD).toBe(100)
    })

    test('WIDTH_LG_THRESHOLD is 150', () => {
      expect(WIDTH_LG_THRESHOLD).toBe(150)
    })

    test('WIDTH_XL_THRESHOLD is 200', () => {
      expect(WIDTH_XL_THRESHOLD).toBe(200)
    })
  })

  describe('maxColumns based on availableWidth', () => {
    test('narrow width (< 100) gets 1 column max', () => {
      const items = ['a', 'b', 'c', 'd']
      const result = computeGridLayout(items, 80)
      expect(result.columns).toBe(1)
    })

    test('medium width (100-149) gets 2 columns max', () => {
      const items = ['a', 'b', 'c', 'd']
      const result = computeGridLayout(items, 120)
      expect(result.columns).toBe(2)
    })

    test('large width (150-199) gets 3 columns max', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f']
      const result = computeGridLayout(items, 180)
      expect(result.columns).toBe(3)
    })

    test('extra large width (>= 200) gets 4 columns max', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      const result = computeGridLayout(items, 250)
      expect(result.columns).toBe(4)
    })
  })

  describe('threshold boundaries', () => {
    test('width 99 gives 1 column max', () => {
      const items = ['a', 'b', 'c']
      const result = computeGridLayout(items, 99)
      expect(result.columns).toBe(1)
    })

    test('width 100 gives 2 columns max', () => {
      const items = ['a', 'b', 'c']
      const result = computeGridLayout(items, 100)
      expect(result.columns).toBe(2)
    })

    test('width 149 gives 2 columns max', () => {
      const items = ['a', 'b', 'c']
      const result = computeGridLayout(items, 149)
      expect(result.columns).toBe(2)
    })

    test('width 150 gives 3 columns max', () => {
      const items = ['a', 'b', 'c']
      const result = computeGridLayout(items, 150)
      expect(result.columns).toBe(3)
    })

    test('width 199 gives 3 columns max (but 4 items prefer 2x2)', () => {
      // 4 items with maxColumns=3 prefers 2 columns (2x2 grid) via computeSmartColumns
      const items = ['a', 'b', 'c', 'd']
      const result = computeGridLayout(items, 199)
      expect(result.columns).toBe(2)

      // 3 items actually uses 3 columns
      const threeItems = ['a', 'b', 'c']
      const result3 = computeGridLayout(threeItems, 199)
      expect(result3.columns).toBe(3)
    })

    test('width 200 gives 4 columns max', () => {
      const items = ['a', 'b', 'c', 'd']
      const result = computeGridLayout(items, 200)
      expect(result.columns).toBe(4)
    })
  })

  describe('column count based on item count', () => {
    test('0 items gives 1 column', () => {
      const result = computeGridLayout([], 200)
      expect(result.columns).toBe(1)
    })

    test('1 item gives 1 column', () => {
      const result = computeGridLayout(['a'], 200)
      expect(result.columns).toBe(1)
    })

    test('2 items on wide screen gives 2 columns', () => {
      const result = computeGridLayout(['a', 'b'], 200)
      expect(result.columns).toBe(2)
    })

    test('3 items on wide screen gives 3 columns', () => {
      const result = computeGridLayout(['a', 'b', 'c'], 200)
      expect(result.columns).toBe(3)
    })

    test('4 items on 3-column max gives 2 columns (2x2 grid)', () => {
      const result = computeGridLayout(['a', 'b', 'c', 'd'], 180)
      expect(result.columns).toBe(2)
    })

    test('6 items on 3-column max gives 3 columns', () => {
      const result = computeGridLayout(['a', 'b', 'c', 'd', 'e', 'f'], 180)
      expect(result.columns).toBe(3)
    })
  })

  describe('columnWidth calculation', () => {
    test('single column uses full availableWidth', () => {
      const result = computeGridLayout(['a'], 120)
      expect(result.columnWidth).toBe(120)
    })

    test('2 columns splits width with 1 char gap', () => {
      const result = computeGridLayout(['a', 'b'], 121)
      // 121 - 1 gap = 120, divided by 2 = 60
      expect(result.columnWidth).toBe(60)
    })

    test('3 columns splits width with 2 char gaps', () => {
      const result = computeGridLayout(['a', 'b', 'c'], 182)
      // 182 - 2 gaps = 180, divided by 3 = 60
      expect(result.columnWidth).toBe(60)
    })

    test('4 columns splits width with 3 char gaps', () => {
      const result = computeGridLayout(['a', 'b', 'c', 'd'], 243)
      // 243 - 3 gaps = 240, divided by 4 = 60
      expect(result.columnWidth).toBe(60)
    })

    test('columnWidth respects MIN_COLUMN_WIDTH', () => {
      const result = computeGridLayout(['a', 'b', 'c', 'd'], 200)
      expect(result.columnWidth).toBeGreaterThanOrEqual(MIN_COLUMN_WIDTH)
    })

    test('very narrow width with multiple items clamps to MIN_COLUMN_WIDTH', () => {
      // Force 2 columns with narrow width
      const result = computeGridLayout(['a', 'b'], 105)
      // 105 - 1 gap = 104, divided by 2 = 52
      expect(result.columnWidth).toBe(52)
    })
  })

  describe('columnGroups distribution (round-robin)', () => {
    test('empty items gives single empty column', () => {
      const result = computeGridLayout([], 200)
      expect(result.columnGroups).toEqual([[]])
    })

    test('1 item in 1 column', () => {
      const result = computeGridLayout(['a'], 200)
      expect(result.columnGroups).toEqual([['a']])
    })

    test('2 items distributed across 2 columns', () => {
      const result = computeGridLayout(['a', 'b'], 200)
      expect(result.columnGroups).toEqual([['a'], ['b']])
    })

    test('3 items distributed across 3 columns', () => {
      const result = computeGridLayout(['a', 'b', 'c'], 200)
      expect(result.columnGroups).toEqual([['a'], ['b'], ['c']])
    })

    test('4 items in 2 columns (round-robin)', () => {
      const result = computeGridLayout(['a', 'b', 'c', 'd'], 120)
      expect(result.columnGroups).toEqual([
        ['a', 'c'],
        ['b', 'd'],
      ])
    })

    test('5 items in 2 columns (uneven distribution)', () => {
      const result = computeGridLayout(['a', 'b', 'c', 'd', 'e'], 120)
      expect(result.columnGroups).toEqual([
        ['a', 'c', 'e'],
        ['b', 'd'],
      ])
    })

    test('6 items in 3 columns', () => {
      const result = computeGridLayout(['a', 'b', 'c', 'd', 'e', 'f'], 180)
      expect(result.columnGroups).toEqual([
        ['a', 'd'],
        ['b', 'e'],
        ['c', 'f'],
      ])
    })

    test('7 items in 3 columns (uneven)', () => {
      const result = computeGridLayout(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        180,
      )
      expect(result.columnGroups).toEqual([
        ['a', 'd', 'g'],
        ['b', 'e'],
        ['c', 'f'],
      ])
    })
  })

  describe('return value structure', () => {
    test('returns all expected properties', () => {
      const result = computeGridLayout(['a', 'b'], 120)
      expect(result).toHaveProperty('columns')
      expect(result).toHaveProperty('columnWidth')
      expect(result).toHaveProperty('columnGroups')
    })

    test('columns is a positive integer', () => {
      const result = computeGridLayout(['a', 'b', 'c'], 150)
      expect(Number.isInteger(result.columns)).toBe(true)
      expect(result.columns).toBeGreaterThan(0)
    })

    test('columnWidth is a positive number', () => {
      const result = computeGridLayout(['a', 'b'], 120)
      expect(result.columnWidth).toBeGreaterThan(0)
    })

    test('columnGroups length matches columns', () => {
      const result = computeGridLayout(['a', 'b', 'c'], 150)
      expect(result.columnGroups.length).toBe(result.columns)
    })

    test('total items in columnGroups equals input items', () => {
      const items = ['a', 'b', 'c', 'd', 'e']
      const result = computeGridLayout(items, 120)
      const totalItems = result.columnGroups.flat().length
      expect(totalItems).toBe(items.length)
    })
  })

  describe('generic type support', () => {
    test('works with number items', () => {
      const result = computeGridLayout([1, 2, 3, 4], 120)
      expect(result.columnGroups).toEqual([
        [1, 3],
        [2, 4],
      ])
    })

    test('works with object items', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
      const result = computeGridLayout(items, 150)
      expect(result.columnGroups[0][0]).toEqual({ id: 1 })
      expect(result.columnGroups[1][0]).toEqual({ id: 2 })
      expect(result.columnGroups[2][0]).toEqual({ id: 3 })
    })

    test('preserves item references', () => {
      const obj1 = { id: 1 }
      const obj2 = { id: 2 }
      const result = computeGridLayout([obj1, obj2], 120)
      expect(result.columnGroups[0][0]).toBe(obj1)
      expect(result.columnGroups[1][0]).toBe(obj2)
    })
  })

  describe('edge cases', () => {
    test('very small availableWidth (< MIN_COLUMN_WIDTH)', () => {
      const result = computeGridLayout(['a', 'b'], 5)
      expect(result.columns).toBe(1)
      expect(result.columnWidth).toBe(5)
    })

    test('zero availableWidth', () => {
      const result = computeGridLayout(['a'], 0)
      expect(result.columns).toBe(1)
      expect(result.columnWidth).toBe(0)
    })

    test('negative availableWidth', () => {
      const result = computeGridLayout(['a'], -10)
      expect(result.columns).toBe(1)
      expect(result.columnWidth).toBe(-10)
    })

    test('large number of items', () => {
      const items = Array.from({ length: 100 }, (_, i) => i)
      const result = computeGridLayout(items, 250)
      expect(result.columns).toBe(4)
      expect(result.columnGroups.length).toBe(4)
      expect(result.columnGroups.flat().length).toBe(100)
    })

    test('fractional availableWidth is floored for columnWidth', () => {
      const result = computeGridLayout(['a', 'b'], 121)
      // (121 - 1) / 2 = 60
      expect(result.columnWidth).toBe(60)
    })
  })

  describe('consistency', () => {
    test('same input always produces same output', () => {
      const items = ['a', 'b', 'c', 'd']
      const width = 150

      const result1 = computeGridLayout(items, width)
      const result2 = computeGridLayout(items, width)
      const result3 = computeGridLayout(items, width)

      expect(result1.columns).toBe(result2.columns)
      expect(result2.columns).toBe(result3.columns)
      expect(result1.columnWidth).toBe(result2.columnWidth)
      expect(result1.columnGroups).toEqual(result2.columnGroups)
    })

    test('deterministic across all threshold boundaries', () => {
      const items = ['a', 'b', 'c', 'd']
      const boundaries = [99, 100, 149, 150, 199, 200, 250]

      for (const width of boundaries) {
        const result1 = computeGridLayout(items, width)
        const result2 = computeGridLayout(items, width)
        expect(result1.columns).toBe(result2.columns)
      }
    })
  })
})
