import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { chatThemes } from '../../../utils/theme-system'
import { getToolComponent, renderToolComponent } from '../registry'

import type { ToolBlock } from '../types'

initializeThemeStore()

const createToolBlock = (
  operation: Record<string, unknown>,
): ToolBlock & { toolName: 'apply_patch' } => ({
  type: 'tool',
  toolName: 'apply_patch',
  toolCallId: 'apply-patch-test-id',
  input: { operation },
})

const renderOptions = {
  availableWidth: 80,
  indentationOffset: 0,
  labelWidth: 0,
}

describe('ApplyPatchComponent', () => {
  test('is registered for apply_patch tool calls', () => {
    expect(getToolComponent('apply_patch')).toBeDefined()
  })

  test('renders create_file operation', () => {
    const toolBlock = createToolBlock({
      type: 'create_file',
      path: 'src/new-file.ts',
      diff: '@@\n+export const value = 1\n',
    })

    const result = renderToolComponent(toolBlock, chatThemes.dark, renderOptions)

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('Create')
    expect(markup).toContain('src/new-file.ts')
  })

  test('renders update_file operation with diff content', () => {
    const toolBlock = createToolBlock({
      type: 'update_file',
      path: 'src/existing.ts',
      diff: '@@\n-oldLine\n+newLine\n',
    })

    const result = renderToolComponent(toolBlock, chatThemes.dark, renderOptions)

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('Edit')
    expect(markup).toContain('src/existing.ts')
    expect(markup).toContain('-oldLine')
    expect(markup).toContain('+newLine')
  })

  test('renders delete_file operation', () => {
    const toolBlock = createToolBlock({
      type: 'delete_file',
      path: 'src/remove-me.ts',
    })

    const result = renderToolComponent(toolBlock, chatThemes.dark, renderOptions)

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('Delete')
    expect(markup).toContain('src/remove-me.ts')
  })
})
