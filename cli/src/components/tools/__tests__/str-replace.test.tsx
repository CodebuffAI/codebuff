import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { chatThemes } from '../../../utils/theme-system'
import { getToolComponent, renderToolComponent } from '../registry'

import type { ToolBlock } from '../types'

initializeThemeStore()

const createWriteFileToolBlock = (
  input: Record<string, unknown>,
  outputRaw?: Array<{ type: 'json'; value: Record<string, unknown> }>,
): ToolBlock & { toolName: 'write_file' } => ({
  type: 'tool',
  toolName: 'write_file',
  toolCallId: 'write-file-test-id',
  input,
  ...(outputRaw !== undefined ? { outputRaw } : {}),
})

const createStrReplaceToolBlock = (
  input: Record<string, unknown>,
  outputRaw?: Array<{ type: 'json'; value: Record<string, unknown> }>,
): ToolBlock & { toolName: 'str_replace' } => ({
  type: 'tool',
  toolName: 'str_replace',
  toolCallId: 'str-replace-test-id',
  input,
  ...(outputRaw !== undefined ? { outputRaw } : {}),
})

const renderOptions = {
  availableWidth: 80,
  indentationOffset: 0,
  labelWidth: 0,
}

describe('StrReplaceComponent', () => {
  test('is registered for write_file and str_replace tool calls', () => {
    expect(getToolComponent('write_file')).toBeDefined()
    expect(getToolComponent('str_replace')).toBeDefined()
  })

  test('renders write_file create with addition-only diff body', () => {
    const toolBlock = createWriteFileToolBlock({ path: 'src/new-file.ts' }, [
      {
        type: 'json',
        value: {
          message: 'Created file successfully',
          unifiedDiff: '@@\n+export const value = 1\n',
        },
      },
    ])

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
    expect(markup).toContain('+export const value = 1')
  })

  test('renders str_replace edit with diff body', () => {
    const toolBlock = createStrReplaceToolBlock({ path: 'src/existing.ts' }, [
      {
        type: 'json',
        value: {
          message: 'String replace applied successfully',
          unifiedDiff: '@@\n-oldLine\n+newLine\n',
        },
      },
    ])

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

  test('renders canonical mutation action patches and create identity', () => {
    const toolBlock = createWriteFileToolBlock(
      { path: 'src/canonical.ts', content: 'export const x = 1\n' },
      [
        {
          type: 'json',
          value: {
            kind: 'file_mutation_result',
            version: 1,
            operationId: 'op',
            outcome: 'applied',
            authorityTier: 'portable_path',
            actions: [
              {
                actionId: 'a',
                index: 0,
                action: 'create',
                path: 'src/canonical.ts',
                outcome: 'applied',
                beforeHash: null,
                afterHash: 'sha256:x',
                patch: '@@\n+export const x = 1\n',
              },
            ],
            errors: [],
            freshCapabilities: [],
          },
        },
      ],
    )
    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )
    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('Create')
    expect(markup).toContain('+export const x = 1')
  })

  test('pending create does not render diff body', () => {
    // A pending write_file has no result yet (no output, no outputRaw, not
    // queued), so shouldShowEditDiff's pending-output guard suppresses the
    // input-derived full-file diff. The block renders as a pending edit with
    // the file path and no addition lines.
    const toolBlock = createWriteFileToolBlock({
      path: 'src/pending.ts',
      content: 'export const value = 1',
    })

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('src/pending.ts')
    expect(markup).toContain('pending')
    expect(markup).not.toContain('+export const value = 1')
    // constructDiffFromWriteFile emits a spaced "+ " prefix; guard both forms
    // so a regression that leaks the input-derived diff is caught.
    expect(markup).not.toContain('+ export const value = 1')
  })

  test('failed edit does not render diff body', () => {
    const toolBlock = createStrReplaceToolBlock({ path: 'src/existing.ts' }, [
      {
        type: 'json',
        value: {
          errorMessage: 'String replace failed: no match found',
          unifiedDiff: '@@\n+newLine\n',
        },
      },
    ])

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )

    expect(result).toBeDefined()
    expect(result?.content).toBeDefined()

    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('failed')
    expect(markup).not.toContain('+newLine')
  })

  test('failed edit keeps bounded multiline recovery details visible', () => {
    const toolBlock = createStrReplaceToolBlock({ path: 'src/existing.ts' }, [
      {
        type: 'json',
        value: {
          errorMessage: [
            'Atomic str_replace batch aborted: 1 of 7 replacements failed.',
            'No changes were made.',
            'Replacement 3/7 failed:',
            'The old string was not found.',
            'Recovery: re-read the exact current range.',
          ].join('\n\n'),
        },
      },
    ])

    const result = renderToolComponent(
      toolBlock,
      chatThemes.dark,
      renderOptions,
    )
    const markup = renderToStaticMarkup(result?.content as React.ReactElement)

    expect(markup).toContain('No changes were made.')
    expect(markup).toContain('Replacement 3/7 failed:')
    expect(markup).toContain('The old string was not found.')
    expect(markup).toContain('…')
    expect(markup).toContain('Recovery: re-read')
  })
})
