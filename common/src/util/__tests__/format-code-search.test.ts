import { describe, expect, it } from 'bun:test'

import { formatCodeSearchOutput } from '../format-code-search'

describe('formatCodeSearchOutput', () => {
  it('adds a match count and line labels', () => {
    const output = formatCodeSearchOutput(
      [
        'src/a.ts:12:const alpha = true',
        'src/a.ts:18:return alpha',
        'src/b.ts:3:export const beta = false',
      ].join('\n'),
      { matchCount: 3 },
    )

    expect(output).toBe(
      [
        'Found 3 matches',
        'src/a.ts:',
        '  Line 12: const alpha = true',
        '  Line 18: return alpha',
        '',
        'src/b.ts:',
        '  Line 3: export const beta = false',
      ].join('\n'),
    )
  })

  it('uses the provided match count instead of counting context lines', () => {
    const output = formatCodeSearchOutput(
      [
        'src/a.ts:10:const before = true',
        'src/a.ts:11:const match = true',
        'src/a.ts:12:const after = true',
      ].join('\n'),
      { matchCount: 1 },
    )

    expect(output).toContain('Found 1 matches')
    expect(output).toContain('  Line 10: const before = true')
    expect(output).toContain('  Line 11: const match = true')
    expect(output).toContain('  Line 12: const after = true')
  })

  it('does not count native ripgrep context lines as matches', () => {
    const output = formatCodeSearchOutput(
      [
        'src/a.ts-10-const before = true',
        'src/a.ts:11:const match = true',
        'src/a.ts-12-const after = true',
      ].join('\n'),
    )

    expect(output).toContain('Found 1 matches')
  })

  it('keeps hyphenated file paths intact for context lines', () => {
    const output = formatCodeSearchOutput(
      [
        'src/component-2-test.ts-9-const before = true',
        'src/component-2-test.ts:10:const match = true',
        'src/component-2-test.ts-11-const after = true',
      ].join('\n'),
    )

    expect(output).toBe(
      [
        'Found 1 matches',
        'src/component-2-test.ts:',
        '  Line 9: const before = true',
        '  Line 10: const match = true',
        '  Line 11: const after = true',
      ].join('\n'),
    )
  })

  it('keeps hyphenated context content intact', () => {
    const output = formatCodeSearchOutput(
      [
        'src/component-2-test.ts-9-const before = "alpha-123-beta"',
        'src/component-2-test.ts:10:const match = true',
      ].join('\n'),
    )

    expect(output).toContain('  Line 9: const before = "alpha-123-beta"')
  })

  it('reports zero matches for empty output', () => {
    expect(formatCodeSearchOutput('')).toBe('Found 0 matches')
  })
})
