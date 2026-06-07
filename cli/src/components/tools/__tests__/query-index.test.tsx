import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { QueryIndexComponent } from '../query-index'

import type { ChatTheme } from '../../../types/theme-system'
import type { ToolBlock } from '../types'

initializeThemeStore()

const createToolBlock = (): ToolBlock & { toolName: 'query_index' } => ({
  type: 'tool',
  toolName: 'query_index',
  toolCallId: 'query-index-test',
  input: {
    query: 'authentication',
    mode: 'explain',
  },
  outputRaw: [
    {
      type: 'json',
      value: {
        results: [
          {
            path: 'docs/authentication.md',
            score: 12.345,
            matchedOn: ['heading', 'concept'],
            relatedFiles: [
              {
                path: 'src/auth.ts',
                reason: 'shares documentation concept',
              },
            ],
            explanation: 'Matched on heading, concept.',
          },
        ],
        message: 'Found 1 indexed file result(s).',
      },
    },
  ],
})

describe('QueryIndexComponent', () => {
  test('renders mode, top results, related files, and explanation', () => {
    const result = QueryIndexComponent.render(
      createToolBlock(),
      {} as ChatTheme,
      {
        availableWidth: 80,
        indentationOffset: 0,
        labelWidth: 10,
      },
    )

    const markup = renderToStaticMarkup(<>{result.content}</>)

    expect(markup).toContain('explain: authentication (1 result)')
    expect(markup).toContain('docs/authentication.md')
    expect(markup).toContain('12.35')
    expect(markup).toContain('heading, concept')
    expect(markup).toContain('related to src/auth.ts')
    expect(markup).toContain('Matched on heading, concept.')
  })
})
