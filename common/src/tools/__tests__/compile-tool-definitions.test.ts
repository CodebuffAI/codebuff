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
    expect(definitions).toMatch(/"params"\?: \{[\s\S]*\[key: string\]: any[\s\S]*\}/)
  })
})
