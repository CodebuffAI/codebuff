import { describe, expect, test } from 'bun:test'

import { compileToolDefinitions } from '../compile-tool-definitions'

describe('compileToolDefinitions', () => {
  test('keeps object tool schemas as interfaces', () => {
    const definitions = compileToolDefinitions()

    expect(definitions).toContain('export interface WebSearchParams {')
  })

  test('preserves loose and catchall object schemas as index signatures', () => {
    const definitions = compileToolDefinitions()

    expect(definitions).toContain('export interface SetOutputParams {')
    expect(definitions).toContain('  [key: string]: any')
    expect(definitions).toContain('export interface SpawnAgentsParams {')
    expect(definitions).toContain('"params"?: {')
    expect(definitions).toMatch(
      /"params"\?: \{[\s\S]*\[key: string\]: any[\s\S]*\}/,
    )
  })

  test('advertises capability-only transaction range edits', () => {
    const definitions = compileToolDefinitions()
    const transaction = definitions.match(
      /export interface EditTransactionParams[\s\S]*?(?=\n\/\*\*)/,
    )?.[0]

    expect(transaction).toContain('"type": "replace_range"')
    expect(transaction).toContain('"readCapability": string')
    expect(transaction).not.toContain('"startLine"')
    expect(transaction).not.toContain('"endLine"')
    expect(transaction).not.toContain('"expectedHash"')
  })

  test('does not generate legacy object-form read anchors', () => {
    const definitions = compileToolDefinitions()
    const strReplace = definitions.match(
      /export interface StrReplaceParams[\s\S]*?(?=\n\/\*\*)/,
    )?.[0]

    expect(strReplace).toContain('"basedOnRead"?: string')
    expect(strReplace).not.toContain('"hash": string')
  })

  test('parenthesizes union array item types', () => {
    const definitions = compileToolDefinitions()

    expect(definitions).toContain(
      '"domains"?: ("security" | "correctness" | "state-mutation" | "error-handling" | "performance" | "dependency-hygiene" | "test-coverage" | "api-contract")[]',
    )
  })
})
