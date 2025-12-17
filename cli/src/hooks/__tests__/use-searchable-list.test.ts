import { describe, test, expect } from 'bun:test'

/**
 * Tests for useSearchableList hook logic.
 *
 * These tests focus on the pure logic aspects of the hook:
 * - Default filter function: case-insensitive label matching
 * - Focus index clamping logic
 * - Filtering behavior
 */

interface TestItem {
  id: string
  label: string
}

// Extract the default filter function for testing
const defaultFilterFn = (item: TestItem, query: string): boolean =>
  item.label.toLowerCase().includes(query.toLowerCase())

// Extract the filter logic for testing
const filterItems = <T extends TestItem>(
  items: T[],
  query: string,
  filterFn: (item: T, query: string) => boolean = defaultFilterFn,
): T[] => {
  if (!query.trim()) return items
  return items.filter((item) => filterFn(item, query))
}

// Extract the focus index clamping logic for testing
const clampFocusIndex = (focusedIndex: number, listLength: number): number => {
  if (focusedIndex >= listLength) {
    return Math.max(0, listLength - 1)
  }
  return focusedIndex
}

describe('useSearchableList - defaultFilterFn', () => {
  describe('case-insensitive matching', () => {
    test('matches exact case', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'Documents')).toBe(true)
    })

    test('matches lowercase query against mixed case label', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'documents')).toBe(true)
    })

    test('matches uppercase query against lowercase label', () => {
      const item = { id: '1', label: 'documents' }
      expect(defaultFilterFn(item, 'DOCUMENTS')).toBe(true)
    })

    test('matches mixed case query against mixed case label', () => {
      const item = { id: '1', label: 'MyDocuments' }
      expect(defaultFilterFn(item, 'mydocuments')).toBe(true)
    })
  })

  describe('substring matching', () => {
    test('matches substring at start', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'Doc')).toBe(true)
    })

    test('matches substring in middle', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'umen')).toBe(true)
    })

    test('matches substring at end', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'ments')).toBe(true)
    })

    test('matches single character', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'o')).toBe(true)
    })

    test('matches full label', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'Documents')).toBe(true)
    })
  })

  describe('non-matching cases', () => {
    test('does not match when query is not in label', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'xyz')).toBe(false)
    })

    test('does not match partial word boundaries', () => {
      const item = { id: '1', label: 'test' }
      expect(defaultFilterFn(item, 'testing')).toBe(false)
    })

    test('does not match reversed substring', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, 'tnemucod')).toBe(false)
    })
  })

  describe('edge cases', () => {
    test('empty query matches everything (via includes behavior)', () => {
      const item = { id: '1', label: 'Documents' }
      expect(defaultFilterFn(item, '')).toBe(true)
    })

    test('handles empty label', () => {
      const item = { id: '1', label: '' }
      expect(defaultFilterFn(item, 'test')).toBe(false)
    })

    test('empty query matches empty label', () => {
      const item = { id: '1', label: '' }
      expect(defaultFilterFn(item, '')).toBe(true)
    })

    test('handles special characters in label', () => {
      const item = { id: '1', label: 'my-project_v2.0' }
      expect(defaultFilterFn(item, 'project_v2')).toBe(true)
    })

    test('handles special characters in query', () => {
      const item = { id: '1', label: 'my-project_v2.0' }
      expect(defaultFilterFn(item, '-project_')).toBe(true)
    })

    test('handles spaces in label', () => {
      const item = { id: '1', label: 'My Documents Folder' }
      expect(defaultFilterFn(item, 'documents folder')).toBe(true)
    })

    test('handles unicode characters', () => {
      const item = { id: '1', label: 'Документы' }
      expect(defaultFilterFn(item, 'докум')).toBe(true)
    })
  })
})

describe('useSearchableList - filterItems', () => {
  const testItems: TestItem[] = [
    { id: '1', label: 'Documents' },
    { id: '2', label: 'Downloads' },
    { id: '3', label: 'Desktop' },
    { id: '4', label: 'Music' },
    { id: '5', label: 'Pictures' },
  ]

  describe('empty query behavior', () => {
    test('returns all items when query is empty', () => {
      const result = filterItems(testItems, '')
      expect(result).toEqual(testItems)
    })

    test('returns all items when query is whitespace only', () => {
      const result = filterItems(testItems, '   ')
      expect(result).toEqual(testItems)
    })

    test('returns all items when query is tabs and newlines', () => {
      const result = filterItems(testItems, '\t\n')
      expect(result).toEqual(testItems)
    })
  })

  describe('filtering behavior', () => {
    test('filters to matching items', () => {
      const result = filterItems(testItems, 'Do')
      expect(result).toHaveLength(2)
      expect(result.map((i) => i.label)).toEqual(['Documents', 'Downloads'])
    })

    test('filters to single matching item', () => {
      const result = filterItems(testItems, 'Music')
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('Music')
    })

    test('returns empty array when nothing matches', () => {
      const result = filterItems(testItems, 'xyz')
      expect(result).toHaveLength(0)
    })

    test('preserves original order', () => {
      const result = filterItems(testItems, 'D')
      expect(result.map((i) => i.label)).toEqual([
        'Documents',
        'Downloads',
        'Desktop',
      ])
    })
  })

  describe('custom filter function', () => {
    test('uses custom filter function when provided', () => {
      const customFilter = (item: TestItem, query: string) =>
        item.label.startsWith(query)
      const result = filterItems(testItems, 'D', customFilter)
      expect(result.map((i) => i.label)).toEqual([
        'Documents',
        'Downloads',
        'Desktop',
      ])
    })

    test('custom filter can match by id', () => {
      const idFilter = (item: TestItem, query: string) => item.id === query
      const result = filterItems(testItems, '3', idFilter)
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('Desktop')
    })

    test('custom filter can implement exact match', () => {
      const exactFilter = (item: TestItem, query: string) =>
        item.label.toLowerCase() === query.toLowerCase()
      const result = filterItems(testItems, 'music', exactFilter)
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('Music')
    })
  })

  describe('edge cases', () => {
    test('handles empty items array', () => {
      const result = filterItems([], 'test')
      expect(result).toEqual([])
    })

    test('handles single item array', () => {
      const single = [{ id: '1', label: 'Test' }]
      const result = filterItems(single, 'Test')
      expect(result).toEqual(single)
    })

    test('does not mutate original array', () => {
      const original = [...testItems]
      filterItems(testItems, 'Do')
      expect(testItems).toEqual(original)
    })
  })
})

describe('useSearchableList - clampFocusIndex', () => {
  describe('when index is within bounds', () => {
    test('returns index unchanged when within bounds', () => {
      expect(clampFocusIndex(2, 5)).toBe(2)
    })

    test('returns 0 when index is 0 and list has items', () => {
      expect(clampFocusIndex(0, 5)).toBe(0)
    })

    test('returns last index when at last position', () => {
      expect(clampFocusIndex(4, 5)).toBe(4)
    })
  })

  describe('when index exceeds bounds', () => {
    test('clamps to last index when focusedIndex equals length', () => {
      expect(clampFocusIndex(5, 5)).toBe(4)
    })

    test('clamps to last index when focusedIndex exceeds length', () => {
      expect(clampFocusIndex(10, 5)).toBe(4)
    })

    test('clamps to 0 when list becomes empty', () => {
      expect(clampFocusIndex(5, 0)).toBe(0)
    })

    test('clamps to 0 when focusedIndex is large and list is empty', () => {
      expect(clampFocusIndex(100, 0)).toBe(0)
    })
  })

  describe('single item list', () => {
    test('returns 0 for single item list when index is 0', () => {
      expect(clampFocusIndex(0, 1)).toBe(0)
    })

    test('clamps to 0 for single item list when index exceeds', () => {
      expect(clampFocusIndex(5, 1)).toBe(0)
    })
  })

  describe('edge cases', () => {
    test('handles negative index (returns as-is since not >= length)', () => {
      // The clamping logic only handles index >= length
      // Negative indices are returned unchanged
      expect(clampFocusIndex(-1, 5)).toBe(-1)
    })

    test('handles very large list length', () => {
      expect(clampFocusIndex(999, 1000)).toBe(999)
      expect(clampFocusIndex(1000, 1000)).toBe(999)
    })
  })
})

describe('useSearchableList - integration scenarios', () => {
  const items: TestItem[] = [
    { id: '1', label: 'alpha' },
    { id: '2', label: 'beta' },
    { id: '3', label: 'gamma' },
    { id: '4', label: 'delta' },
    { id: '5', label: 'epsilon' },
  ]

  test('scenario: filter reduces list and clamp adjusts index', () => {
    // Start with focusedIndex = 4 (epsilon)
    let focusedIndex = 4
    
    // Filter to items containing 'a' -> [alpha, beta, gamma, delta] (beta contains 'a')
    const filtered = filterItems(items, 'a')
    expect(filtered).toHaveLength(4)
    
    // Clamp the focus index
    focusedIndex = clampFocusIndex(focusedIndex, filtered.length)
    expect(focusedIndex).toBe(3) // Clamped to last index (4-1=3)
  })

  test('scenario: filter to empty list clamps to 0', () => {
    let focusedIndex = 2
    
    const filtered = filterItems(items, 'xyz')
    expect(filtered).toHaveLength(0)
    
    focusedIndex = clampFocusIndex(focusedIndex, filtered.length)
    expect(focusedIndex).toBe(0)
  })

  test('scenario: clearing filter restores full list', () => {
    // First filter - 'a' matches alpha, beta, gamma, delta
    let filtered = filterItems(items, 'a')
    expect(filtered).toHaveLength(4)
    
    // Clear filter
    filtered = filterItems(items, '')
    expect(filtered).toHaveLength(5)
    expect(filtered).toEqual(items)
  })

  test('scenario: progressive filtering narrows results', () => {
    // 'a' matches alpha, beta, gamma, delta (all contain 'a')
    let filtered = filterItems(items, 'a')
    expect(filtered.map((i) => i.label)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
    
    // 'al' only matches alpha
    filtered = filterItems(items, 'al')
    expect(filtered.map((i) => i.label)).toEqual(['alpha'])
    
    // 'alp' still only matches alpha
    filtered = filterItems(items, 'alp')
    expect(filtered.map((i) => i.label)).toEqual(['alpha'])
  })
})
