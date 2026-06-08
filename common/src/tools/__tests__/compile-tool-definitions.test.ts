import { describe, expect, test } from 'bun:test'
import z from 'zod/v4'

import { compileToolDefinitions } from '../compile-tool-definitions'

// These tests feed synthetic schemas so they exercise the compile logic
// directly and stay stable as real tools are added, removed, or reshaped.
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
    const objectSchema = z.object({ query: z.string() })
    const definitions = compileToolDefinitions([
      { name: 'web_search', inputSchema: objectSchema },
    ])

    expect(definitions).toContain('export interface WebSearchParams {')
  })

  test('compiles every published tool by default', () => {
    const definitions = compileToolDefinitions()

    expect(definitions).toContain('export type ToolName =')
    expect(definitions).toContain('export interface ToolParamsMap {')
  })
})
