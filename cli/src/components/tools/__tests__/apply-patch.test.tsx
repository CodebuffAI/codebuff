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
  outputRaw?: unknown,
): ToolBlock & { toolName: 'apply_patch' } =>
  ({
    type: 'tool',
    toolName: 'apply_patch',
    toolCallId: 'apply-patch-test-id',
    input: { operation },
    ...(outputRaw !== undefined ? { outputRaw } : {}),
  }) as ToolBlock & { toolName: 'apply_patch' }

const successOutput = [
  {
    type: 'json' as const,
    value: {
      message: 'Applied patch successfully',
      applied: [{ file: 'src/file.ts', action: 'update' }],
    },
  },
]

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
    const toolBlock = createToolBlock(
      {
        type: 'create_file',
        path: 'src/new-file.ts',
        diff: '@@\n+export const value = 1\n',
      },
      successOutput,
    )

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('Create')
    expect(markup).toContain('src/new-file.ts')
    expect(markup).toContain('applied')
    expect(markup).toContain('+export const value = 1')
  })

  test('renders update_file operation with diff content', () => {
    const toolBlock = createToolBlock(
      {
        type: 'update_file',
        path: 'src/existing.ts',
        diff: '@@\n-oldLine\n+newLine\n',
      },
      successOutput,
    )

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('Edit')
    expect(markup).toContain('src/existing.ts')
    expect(markup).toContain('-oldLine')
    expect(markup).toContain('+newLine')
  })

  test('renders delete_file operation', () => {
    const toolBlock = createToolBlock(
      {
        type: 'delete_file',
        path: 'src/remove-me.ts',
      },
      successOutput,
    )

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('Delete')
    expect(markup).toContain('src/remove-me.ts')
  })

  test('does not render the requested diff as applied while pending', () => {
    const toolBlock = createToolBlock({
      type: 'update_file',
      path: 'src/pending.ts',
      diff: '@@\n-oldLine\n+newLine\n',
    })

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )
    const markup = renderToStaticMarkup(result?.content as React.ReactElement)

    expect(markup).toContain('pending')
    expect(markup).not.toContain('+newLine')
  })

  test('renders failure status and labels the requested diff as not applied', () => {
    const toolBlock = createToolBlock(
      {
        type: 'update_file',
        path: 'src/failed.ts',
        diff: '@@\n-oldLine\n+newLine\n',
      },
      [
        {
          type: 'json',
          value: { errorMessage: 'Ambiguous Context: two blocks matched' },
        },
      ],
    )

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )
    const markup = renderToStaticMarkup(result?.content as React.ReactElement)

    expect(markup).toContain('failed')
    expect(markup).toContain('Ambiguous Context')
    expect(markup).toContain('Attempted patch (not applied)')
    expect(markup).toContain('+newLine')
  })

  test('requires positive success evidence and rejects malformed result shapes', () => {
    const cases: unknown[] = [
      [],
      [{ type: 'json', value: {} }],
      [{ type: 'json', value: { applied: false } }],
      [{ type: 'json', value: { nested: { errorMessage: 'nested error' } } }],
      'Error: patch failed',
    ]

    for (const outputRaw of cases) {
      const toolBlock = createToolBlock(
        {
          type: 'update_file',
          path: 'src/unknown.ts',
          diff: '@@\n-oldLine\n+newLine\n',
        },
        outputRaw,
      )
      const result = renderToolComponent(
        toolBlock,
        chatThemes.dark,
        renderOptions,
      )
      const markup = renderToStaticMarkup(result?.content as React.ReactElement)

      expect(markup).toContain('failed')
      expect(markup).toContain('Attempted patch (not applied)')
      expect(markup).toContain('+newLine')
    }
  })
})
