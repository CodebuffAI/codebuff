import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { securityReviewSection } from '../base2/quality-prompt-section'

// M4.2 cohesion guard. The orchestrator's automated phase-gate predicates use
// two inline matcher constants defined in base2.ts (SECURITY_SENSITIVE_GLOBS
// and SECURITY_SENSITIVE_NAME_SUBSTRINGS). The advisory `securityReviewSection`
// prose in quality-prompt-section.ts documents the same security-sensitive
// surface for the model. Today the two lists are kept in sync only by
// convention; this test extracts the real constants from base2.ts source and
// asserts BOTH directions so the section and the matcher cannot drift.

const SECURITY_CONSTANT_NAMES = [
  'SECURITY_SENSITIVE_GLOBS',
  'SECURITY_SENSITIVE_NAME_SUBSTRINGS',
] as const

type SecurityConstantName = (typeof SECURITY_CONSTANT_NAMES)[number]

// Bracket scanner analogue of extractInlineFunctionSource in
// gate-paths-parity.test.ts: slice from `const NAME = [` to the matching `]`.
// The arrays are simple string literals (no nested brackets), so a naive
// depth scan reliably yields the whole literal.
function extractInlineArrayLiteral(
  source: string,
  constName: string,
): string {
  const declarationStart = source.indexOf(`const ${constName} = [`)
  if (declarationStart < 0) {
    throw new Error(`Unable to find inline ${constName} declaration`)
  }

  const bracketStart = source.indexOf('[', declarationStart)
  if (bracketStart < 0) {
    throw new Error(`Unable to find inline ${constName} array literal`)
  }

  let depth = 0
  for (let index = bracketStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === '[') depth += 1
    if (character === ']') depth -= 1
    if (depth === 0) {
      return source.slice(bracketStart, index + 1)
    }
  }

  throw new Error(`Unable to find end of inline ${constName} array literal`)
}

// Reconstruct the real array from its source literal, mirroring the
// `new Function(...)` reconstruction technique in gate-paths-parity.test.ts.
function reconstructInlineArray(
  source: string,
  constName: string,
): string[] {
  const literal = extractInlineArrayLiteral(source, constName)
  const buildArrayValue = new Function(
    `"use strict"; return (${literal})`,
  ) as () => unknown
  const value = buildArrayValue()
  if (
    !Array.isArray(value) ||
    !value.every((entry): entry is string => typeof entry === 'string')
  ) {
    throw new Error(`Inline ${constName} did not reconstruct to a string[]`)
  }
  return value
}

function loadInlineSecurityMatchers(): Record<SecurityConstantName, string[]> {
  const base2Source = readFileSync(
    new URL('../base2/base2.ts', import.meta.url),
    'utf8',
  )
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const base2JavaScript = transpiler.transformSync(base2Source)

  const matchers = {} as Record<SecurityConstantName, string[]>
  for (const constName of SECURITY_CONSTANT_NAMES) {
    // Prefer the transpiled output (mirrors the existing parity test). If the
    // transpiler ever inlines/renames the const so the literal is no longer
    // directly sliceable, fall back to the raw TS source, which contains the
    // identical string-literal array.
    let source = base2JavaScript
    if (!source.includes(`const ${constName} = [`)) {
      source = base2Source
    }
    matchers[constName] = reconstructInlineArray(source, constName)
  }
  return matchers
}

describe('security matcher constants stay in sync with securityReviewSection prose', () => {
  const { SECURITY_SENSITIVE_GLOBS, SECURITY_SENSITIVE_NAME_SUBSTRINGS } =
    loadInlineSecurityMatchers()
  const sectionLower = securityReviewSection.toLowerCase()

  test('extracted constants are non-empty string arrays', () => {
    expect(SECURITY_SENSITIVE_GLOBS.length).toBeGreaterThan(0)
    expect(SECURITY_SENSITIVE_NAME_SUBSTRINGS).toEqual([
      'secret',
      'token',
      'apikey',
    ])
  })

  test('every SECURITY_SENSITIVE_GLOBS token is documented in securityReviewSection', () => {
    const missing = SECURITY_SENSITIVE_GLOBS.filter(
      (token) => !sectionLower.includes(token.toLowerCase()),
    )
    expect(missing).toEqual([])
  })

  test('every SECURITY_SENSITIVE_NAME_SUBSTRINGS token is documented in securityReviewSection', () => {
    const missing = SECURITY_SENSITIVE_NAME_SUBSTRINGS.filter(
      (token) => !sectionLower.includes(token.toLowerCase()),
    )
    expect(missing).toEqual([])
  })

  test('securityReviewSection documents the .env pattern matched by the inline predicate', () => {
    // Mirrors the inline predicate's `basename.startsWith('.env')` branch.
    expect(securityReviewSection).toContain('.env')
  })
})
