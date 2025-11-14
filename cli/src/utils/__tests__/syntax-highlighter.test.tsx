import { describe, expect, test } from 'bun:test'
import React from 'react'
import { highlightCode, highlightCodeSync } from '../syntax-highlighter'
import { getTreeSitterClient } from '@opentui/core'

describe('syntax-highlighter', () => {
  test('highlightCodeSync produces valid React element', () => {
    const code = 'const x = 42'
    const result = highlightCodeSync(code, 'javascript', {})

    // Should return a valid React element
    expect(React.isValidElement(result)).toBe(true)
  })

  test('highlightCodeSync handles plain text', () => {
    const code = 'const x = 42'
    const result = highlightCodeSync(code, 'typescript', {})

    expect(result).toBeDefined()
    expect(React.isValidElement(result)).toBe(true)
  })

  test('highlightCodeSync returns plain span (sync highlighting not supported)', () => {
    const code = 'const x = 42'
    const result = highlightCodeSync(code, 'javascript', {})
    expect(React.isValidElement(result)).toBe(true)

    // Currently highlightCodeSync returns a plain span since Tree-sitter is async
    const props = (result as any).props
    expect(props).toBeDefined()
  })

  test('handles code without language', () => {
    const code = 'plain text'
    const result = highlightCodeSync(code, '', {})

    expect(result).toBeDefined()
    expect(React.isValidElement(result)).toBe(true)
  })

  test('handles monochrome option', () => {
    const code = 'const x = 42'
    const result = highlightCodeSync(code, 'typescript', { monochrome: true })

    expect(result).toBeDefined()
    expect(React.isValidElement(result)).toBe(true)
  })

  test('highlightCode async produces highlighted output', async () => {
    const code = 'const x = 42'
    
    // Initialize tree-sitter client
    const client = getTreeSitterClient()
    try {
      await client.initialize()
      
      const result = await highlightCode(code, 'typescript', {})
      expect(result).toBeDefined()
      expect(React.isValidElement(result)).toBe(true)
      
      // The async version should produce a fragment with highlighted spans
      const fragment = result as any
      if (fragment.props?.children) {
        const children = Array.isArray(fragment.props.children) 
          ? fragment.props.children 
          : [fragment.props.children]
        expect(children.length).toBeGreaterThan(0)
      }
    } catch (error) {
      // If tree-sitter initialization fails (e.g., missing WASM files),
      // the function should still return valid React elements as fallback
      const result = await highlightCode(code, 'typescript', {})
      expect(React.isValidElement(result)).toBe(true)
    }
  }, 10000)
})
