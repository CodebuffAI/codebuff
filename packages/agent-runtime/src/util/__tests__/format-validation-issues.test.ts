import { describe, expect, test } from 'bun:test'

import { formatValidationIssues } from '../format-validation-issues'
import { formatValueForError } from '../format-value'

describe('formatValidationIssues', () => {
  test('summarizes missing required fields with dotted paths', () => {
    expect(
      formatValidationIssues({
        issues: [
          {
            code: 'invalid_type',
            expected: 'string',
            path: ['command'],
            message: 'Invalid input: expected string, received undefined',
          },
        ],
      }),
    ).toBe('Missing required: command')
  })

  test('formats array indices as bracket notation', () => {
    expect(
      formatValidationIssues({
        issues: [
          {
            code: 'invalid_type',
            expected: 'string',
            path: ['replacements', 0, 'newString'],
            message: 'Invalid input: expected string, received undefined',
          },
        ],
      }),
    ).toBe('Missing required: replacements[0].newString')
  })

  test('uses tool-specific summary for str_replace missing replacement fields', () => {
    const summary = formatValidationIssues({
      toolName: 'str_replace',
      issues: [
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['replacements', 0, 'newString'],
          message: 'Invalid input: expected string, received undefined',
        },
      ],
    })
    expect(summary).toContain('Missing required replacement fields:')
    expect(summary).toContain('- replacements[0].newString')
    expect(summary).toContain(
      'If the intent is deletion, set "newString": "" explicitly.',
    )
  })

  test('falls back to detailed messages for non-missing issues', () => {
    expect(
      formatValidationIssues({
        issues: [
          {
            code: 'too_small',
            path: ['lines'],
            message: 'Value must be greater than 0',
          },
        ],
      }),
    ).toBe('lines: Value must be greater than 0')
  })

  test('returns raw JSON for empty issue lists', () => {
    expect(formatValidationIssues({ issues: [] })).toBe('[]')
  })
})

describe('formatValueForError', () => {
  test('formats primitives with type information', () => {
    expect(formatValueForError('hello')).toBe('"hello" (type: string)')
    expect(formatValueForError(undefined)).toBe('undefined (type: undefined)')
    expect(formatValueForError(null)).toBe('null (type: null)')
  })

  test('does not throw for circular objects', () => {
    const value: { name: string; self?: unknown } = { name: 'loop' }
    value.self = value

    expect(formatValueForError(value)).toContain('[Unserializable value:')
  })

  test('does not throw for bigint values', () => {
    expect(formatValueForError(1n)).toContain('[Unserializable value:')
    expect(formatValueForError(1n)).toContain('(type: bigint)')
  })

  test('truncates serialized values after fallback formatting', () => {
    const value: { self?: unknown } = {}
    value.self = value

    expect(formatValueForError(value, 10)).toBe('[Unseriali...(truncated)')
  })
})
