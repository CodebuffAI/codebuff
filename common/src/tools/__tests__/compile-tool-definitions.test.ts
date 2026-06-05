import { describe, expect, test } from 'bun:test'

import { compileToolDefinitions } from '../compile-tool-definitions'

describe('compileToolDefinitions', () => {
  test('emits gravity index action enum values', () => {
    const definitions = compileToolDefinitions()

    expect(definitions).toContain('export interface GravityIndexParams {')
    expect(definitions).not.toContain('export type GravityIndexParams =')
    expect(definitions).toContain(
      '"action": "search" | "browse" | "list_categories" | "get_service" | "report_integration"',
    )
  })

  test('keeps object tool schemas as interfaces', () => {
    const definitions = compileToolDefinitions()

    expect(definitions).toContain('export interface WebSearchParams {')
  })
})
