import { describe, expect, test } from 'bun:test'

import {
  buildRepairEditorPrompt,
  parseValidationFailures,
} from '../base2/gate-repair'

describe('parseValidationFailures', () => {
  test('parses tsc diagnostic format: file(line,col): error TSxxxx: message', () => {
    const failures = [
      '- tsc failed (exit 1):\nsrc/foo.ts(12,5): error TS2322: Type \'string\' is not assignable to type \'number\'.\nsrc/foo.ts(28,10): error TS2304: Cannot find name \'bar\'.',
    ]
    const result = parseValidationFailures(failures)
    expect(result).toEqual([
      {
        file: 'src/foo.ts',
        line: 12,
        column: 5,
        message: 'error: TS2322: Type \'string\' is not assignable to type \'number\'.',
        source: 'tsc',
      },
      {
        file: 'src/foo.ts',
        line: 28,
        column: 10,
        message: 'error: TS2304: Cannot find name \'bar\'.',
        source: 'tsc',
      },
    ])
  })

  test('parses tsc warning severity', () => {
    const failures = [
      '- tsc failed (exit 1):\nsrc/a.ts(3,1): warning TS6133: \'x\' is declared but its value is never read.',
    ]
    const result = parseValidationFailures(failures)
    expect(result).toEqual([
      {
        file: 'src/a.ts',
        line: 3,
        column: 1,
        message: 'warning: TS6133: \'x\' is declared but its value is never read.',
        source: 'tsc',
      },
    ])
  })

  test('parses eslint unix format: file:line:col: message', () => {
    const failures = [
      '- eslint failed (exit 1):\nsrc/bar.ts:10:5: no-unused-vars is defined but never used [eslint/no-unused-vars]\nsrc/bar.ts:20:3: unexpected token \'{\' [eslint/parse-error]',
    ]
    const result = parseValidationFailures(failures)
    expect(result).toEqual([
      {
        file: 'src/bar.ts',
        line: 10,
        column: 5,
        message: 'no-unused-vars is defined but never used [eslint/no-unused-vars]',
        source: 'eslint',
      },
      {
        file: 'src/bar.ts',
        line: 20,
        column: 3,
        message: 'unexpected token \'{\' [eslint/parse-error]',
        source: 'eslint',
      },
    ])
  })

  test('parses gcc format: file:line: message (no column)', () => {
    const failures = [
      '- gcc failed (exit 2):\nsrc/main.c:42: error: expected \';\' before \'}\' token\nsrc/main.c:88: warning: unused variable \'x\'',
    ]
    const result = parseValidationFailures(failures)
    expect(result).toEqual([
      {
        file: 'src/main.c',
        line: 42,
        column: undefined,
        message: 'error: expected \';\' before \'}\' token',
        source: 'gcc',
      },
      {
        file: 'src/main.c',
        line: 88,
        column: undefined,
        message: 'warning: unused variable \'x\'',
        source: 'gcc',
      },
    ])
  })

  test('deduplicates identical file:line:column within one failure body', () => {
    const failures = [
      '- tsc failed (exit 1):\nsrc/dup.ts(1,1): error TS2322: x\nsrc/dup.ts(1,1): error TS2322: x',
    ]
    const result = parseValidationFailures(failures)
    expect(result).toHaveLength(1)
    expect(result[0].file).toBe('src/dup.ts')
    expect(result[0].line).toBe(1)
  })

  test('extracts hook name from - {name} failed (exit N): prefix', () => {
    const failures = ['- my-custom-hook failed (exit 1):\nsrc/x.ts:5:3: boom']
    const result = parseValidationFailures(failures)
    expect(result[0].source).toBe('my-custom-hook')
  })

  test('falls back to source "unknown" when no prefix present', () => {
    const failures = ['src/x.ts:5:3: something broke']
    const result = parseValidationFailures(failures)
    expect(result[0].source).toBe('unknown')
  })

  test('produces file:"" entry for unparseable failure output', () => {
    const failures = [
      '- tsc failed (exit 1):\nThis is a totally unstructured error message with no file:line pattern whatsoever.',
    ]
    const result = parseValidationFailures(failures)
    expect(result).toHaveLength(1)
    expect(result[0].file).toBe('')
    expect(result[0].source).toBe('tsc')
    expect(result[0].message).toContain('unstructured error message')
  })

  test('mixed parseable and unparseable lines in one body', () => {
    const failures = [
      '- tsc failed (exit 1):\nsrc/a.ts(5,1): error TS1005: \'{\' expected.\nSome random build step note that has no location.',
    ]
    const result = parseValidationFailures(failures)
    // The parseable line wins (tscRe matches first), so the unparseable note
    // is NOT separately emitted — only the first matching format per body.
    expect(result).toEqual([
      {
        file: 'src/a.ts',
        line: 5,
        column: 1,
        message: 'error: TS1005: \'{\' expected.',
        source: 'tsc',
      },
    ])
  })

  test('handles empty and malformed inputs gracefully', () => {
    expect(parseValidationFailures([])).toEqual([])
    expect(parseValidationFailures([''])).toEqual([])
    expect(parseValidationFailures(['   '])).toEqual([])
  })

  test('handles multiple hook failures in one call', () => {
    const failures = [
      '- tsc failed (exit 1):\nsrc/a.ts(1,1): error TS1: msg',
      '- eslint failed (exit 1):\nsrc/b.ts:2:3: lint error',
    ]
    const result = parseValidationFailures(failures)
    expect(result).toHaveLength(2)
    expect(result[0].source).toBe('tsc')
    expect(result[1].source).toBe('eslint')
  })
})

describe('buildRepairEditorPrompt', () => {
  test('groups failures by file', () => {
    const parsed = [
      { file: 'src/a.ts', line: 10, column: 5, message: 'error TS1', source: 'tsc' },
      { file: 'src/a.ts', line: 25, column: 1, message: 'error TS2', source: 'tsc' },
      { file: 'src/b.ts', line: 3, column: undefined, message: 'eslint issue', source: 'eslint' },
    ]
    const prompt = buildRepairEditorPrompt(parsed, [])
    expect(prompt).toContain('Failing locations (file:line:column — message):')
    expect(prompt).toContain('  src/a.ts:')
    expect(prompt).toContain('    10:5 — [tsc] error TS1')
    expect(prompt).toContain('    25:1 — [tsc] error TS2')
    expect(prompt).toContain('  src/b.ts:')
    expect(prompt).toContain('    3 — [eslint] eslint issue')
  })

  test('includes unparsed failures as raw text', () => {
    const parsed = [
      { file: '', message: 'unparseable raw output', source: 'unknown' },
    ]
    const prompt = buildRepairEditorPrompt(parsed, [])
    expect(prompt).toContain('No specific file:line locations could be parsed')
    expect(prompt).toContain('Raw unparsed failures:')
    expect(prompt).toContain('  [unknown] unparseable raw output')
  })

  test('includes pending changed files when provided', () => {
    const prompt = buildRepairEditorPrompt([], ['src/a.ts', 'src/b.ts'])
    expect(prompt).toContain('Pending changed files: src/a.ts, src/b.ts')
  })

  test('omits pending files section when empty', () => {
    const prompt = buildRepairEditorPrompt([], [])
    expect(prompt).not.toContain('Pending changed files')
  })

  test('includes instruction to make minimal targeted fix', () => {
    const prompt = buildRepairEditorPrompt([], [])
    expect(prompt).toContain('minimal targeted fix')
    expect(prompt).toContain('gate will re-run validation automatically')
  })

  test('renders line-only location (no column) with just the line number', () => {
    const parsed = [
      { file: 'src/c.ts', line: 42, column: undefined, message: 'gcc error', source: 'gcc' },
    ]
    const prompt = buildRepairEditorPrompt(parsed, [])
    expect(prompt).toContain('    42 — [gcc] gcc error')
  })
})
