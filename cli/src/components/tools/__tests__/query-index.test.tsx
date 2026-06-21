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

  test('hard-wraps long path, snippet, related file, explanation, and header text for narrow widths', () => {
    const longPath = `src/${'very-long-unbroken-directory-name-'.repeat(3)}file.ts`
    const longSnippet = 'snippet:' + 'x'.repeat(90)
    const longRelatedPath = `docs/${'related-unbroken-segment-'.repeat(3)}guide.md`
    const longExplanation = `Explanation ${'y'.repeat(100)}`
    const toolBlock = createToolBlock()
    toolBlock.input = {
      query: 'q'.repeat(80),
      mode: 'search',
    }
    toolBlock.outputRaw = [
      {
        type: 'json',
        value: {
          results: [
            {
              path: longPath,
              score: 1,
              matchedOn: ['path'],
              matchedSnippets: [longSnippet],
              relatedFiles: [
                {
                  path: longRelatedPath,
                  reason: 'reason-' + 'z'.repeat(80),
                },
              ],
              explanation: longExplanation,
            },
          ],
        },
      },
    ]

    const result = QueryIndexComponent.render(
      toolBlock,
      {} as ChatTheme,
      {
        availableWidth: 36,
        indentationOffset: 0,
        labelWidth: 10,
      },
    )

    const markup = renderToStaticMarkup(<>{result.content}</>)
    const text = markup.replace(/<[^>]*>/g, '')

    expect(text).toContain(`${'q'.repeat(26)}\n${'q'.repeat(26)}`)
    expect(text).toContain(`${longPath.slice(0, 31)}\n${longPath.slice(31, 62)}`)
    expect(text).toContain('snippet:')
    expect(text).toContain('x'.repeat(31))
    expect(text).toContain('related to docs/')
    expect(text).toContain(`${'y'.repeat(31)}\n${'y'.repeat(31)}`)
  })
})
