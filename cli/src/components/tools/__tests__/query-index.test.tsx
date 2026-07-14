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
        kind: 'query_index_result',
        schemaVersion: 1,
        results: [
          {
            path: 'docs/authentication.md',
            score: 12.345,
            indexedHash: 'abcdef0123456789',
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
        totalIndexed: 321,
        indexAge: 125_000,
        message: 'Found 1 indexed file result(s).',
        snapshot: {
          schemaVersion: 1,
          snapshotId:
            '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          indexVersion: '2',
          builtAt: 1,
          workspaceRevision: 4,
        },
        status: {
          state: 'ready',
          ready: true,
          stale: false,
          refreshing: false,
          semantic: 'ready',
          diagnostics: [],
          message: 'Index ready.',
        },
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
    expect(markup).toContain('hash abcdef012345')
    expect(markup).toContain('related to src/auth.ts')
    expect(markup).toContain('Matched on heading, concept.')
    expect(markup).toContain('Status:')
    expect(markup).toContain('ready')
    expect(markup).toContain('321 indexed files')
    expect(markup).toContain('age 2m')
    expect(markup).toContain('Snapshot: 1234567890abcdef · workspace r4')
  })

  test('renders structured stale/degraded status, coverage, and diagnostics', () => {
    const toolBlock = createToolBlock()
    toolBlock.outputRaw = [
      {
        type: 'json',
        value: {
          results: [],
          totalIndexed: 100,
          indexAge: 1_000,
          status: {
            state: 'degraded',
            ready: true,
            stale: true,
            refreshing: true,
            semantic: 'failed',
            diagnostics: [
              {
                filePath: 'src/bad.ts',
                stage: 'parse',
                message: 'syntax error',
              },
            ],
            coverage: {
              truncated: true,
              maxFiles: 100,
              skippedFiles: 8,
              skippedPrefixes: ['vendor'],
              parser: {
                requestedFiles: 100,
                parsedFiles: 80,
                skippedFiles: 20,
                skippedLanguages: ['ruby'],
                truncated: true,
              },
            },
            lastBuildError: {
              stage: 'persist',
              message: 'cache revision conflict',
              retryable: true,
            },
            message: 'Index ready with parser diagnostics.',
          },
        },
      },
    ]

    const rendered = QueryIndexComponent.render(toolBlock, {} as ChatTheme, {
      availableWidth: 80,
      indentationOffset: 0,
      labelWidth: 10,
    })
    const markup = renderToStaticMarkup(<>{rendered.content}</>)

    expect(markup).toContain('degraded · refreshing')
    expect(markup).toContain('Vector embeddings: failed')
    expect(markup).toContain('Partial coverage')
    expect(markup).toContain('src/bad.ts')
    expect(markup).toContain('syntax error')
    expect(markup).toContain('Parser coverage: 80/100 parsed')
    expect(markup).toContain('Build error (persist): cache revision conflict')
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

    const result = QueryIndexComponent.render(toolBlock, {} as ChatTheme, {
      availableWidth: 36,
      indentationOffset: 0,
      labelWidth: 10,
    })

    const markup = renderToStaticMarkup(<>{result.content}</>)
    const text = markup.replace(/<[^>]*>/g, '')

    expect(text).toContain(`${'q'.repeat(26)}\n${'q'.repeat(26)}`)
    expect(text).toContain(
      `${longPath.slice(0, 31)}\n${longPath.slice(31, 62)}`,
    )
    expect(text).toContain('snippet:')
    expect(text).toContain('x'.repeat(31))
    expect(text).toContain('related to docs/')
    expect(text).toContain(`${'y'.repeat(31)}\n${'y'.repeat(31)}`)
  })

  test('renders disabled/building guidance and all results beyond the old top-three cap', () => {
    const toolBlock = createToolBlock()
    toolBlock.outputRaw = [
      {
        type: 'json',
        value: {
          results: ['a.ts', 'b.ts', 'c.ts', 'd.ts'].map((path) => ({
            path,
            score: 1,
          })),
          totalIndexed: 100,
          indexAge: 10,
          message: 'Found 4 indexed file result(s).',
        },
      },
    ]

    const rendered = QueryIndexComponent.render(toolBlock, {} as ChatTheme, {
      availableWidth: 80,
      indentationOffset: 0,
      labelWidth: 10,
    })
    const markup = renderToStaticMarkup(<>{rendered.content}</>)

    expect(markup).toContain('1 additional result shown below')
    expect(markup).toContain('d.ts')

    toolBlock.outputRaw = [
      {
        type: 'json',
        value: {
          results: [],
          totalIndexed: 0,
          indexAge: 0,
          message:
            'Codebase indexing is disabled in openbuff.json; fall back to read_subtree, glob, or code_search.',
        },
      },
    ]
    const disabled = QueryIndexComponent.render(toolBlock, {} as ChatTheme, {
      availableWidth: 80,
      indentationOffset: 0,
      labelWidth: 10,
    })
    const disabledMarkup = renderToStaticMarkup(<>{disabled.content}</>)
    expect(disabledMarkup).toContain('disabled')
    expect(disabledMarkup).toContain('fall back to read_subtree')
  })
})
