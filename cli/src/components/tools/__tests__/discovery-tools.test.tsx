import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { GlobComponent } from '../glob'
import { ListDirectoryComponent } from '../list-directory'

import type { ChatTheme } from '../../../types/theme-system'
import type { ToolBlock } from '../types'

initializeThemeStore()

const options = {
  availableWidth: 80,
  indentationOffset: 0,
  labelWidth: 10,
}

describe('discovery tool renderers', () => {
  test('glob renders count, scope, files, and exact errors', () => {
    const block: ToolBlock & { toolName: 'glob' } = {
      type: 'tool',
      toolName: 'glob',
      toolCallId: 'glob-1',
      input: { pattern: '*.ts', cwd: 'src' },
      lifecycle: 'succeeded',
      outputRaw: [
        {
          type: 'json',
          value: {
            files: ['src/a.ts', 'src/b.ts'],
            count: 2,
            message: 'Found 2 files.',
          },
        },
      ],
    }

    const rendered = GlobComponent.render(block, {} as ChatTheme, options)
    const markup = renderToStaticMarkup(<>{rendered.content}</>)
    expect(markup).toContain('2 files')
    expect(markup).toContain('Scope:')
    expect(markup).toContain('src/a.ts')

    block.lifecycle = 'failed'
    block.outputRaw = [
      { type: 'json', value: { errorMessage: 'Invalid cwd: outside project' } },
    ]
    const failed = GlobComponent.render(block, {} as ChatTheme, options)
    expect(renderToStaticMarkup(<>{failed.content}</>)).toContain(
      'Invalid cwd: outside project',
    )
  })

  test('list_directory renders directory/file counts and entries', () => {
    const block: ToolBlock & { toolName: 'list_directory' } = {
      type: 'tool',
      toolName: 'list_directory',
      toolCallId: 'list-1',
      input: { path: 'src' },
      lifecycle: 'succeeded',
      outputRaw: [
        {
          type: 'json',
          value: {
            path: 'src',
            directories: ['components'],
            files: ['index.ts'],
          },
        },
      ],
    }

    const rendered = ListDirectoryComponent.render(
      block,
      {} as ChatTheme,
      options,
    )
    const markup = renderToStaticMarkup(<>{rendered.content}</>)
    expect(markup).toContain('1 dirs, 1 files')
    expect(markup).toContain('components/')
    expect(markup).toContain('index.ts')
  })
})
