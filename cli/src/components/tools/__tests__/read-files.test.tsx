import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { chatThemes } from '../../../utils/theme-system'
import { renderToolComponent } from '../registry'

import type { ToolBlock } from '../types'

initializeThemeStore()

const renderOptions = {
  availableWidth: 100,
  indentationOffset: 0,
  labelWidth: 0,
}

function createBlock(
  input: Record<string, unknown>,
  outputRaw?: unknown,
): ToolBlock & { toolName: 'read_files' } {
  return {
    type: 'tool',
    toolName: 'read_files',
    toolCallId: 'read-files-test',
    input,
    ...(outputRaw !== undefined ? { outputRaw } : {}),
  } as ToolBlock & { toolName: 'read_files' }
}

describe('ReadFilesComponent', () => {
  test('[ERR-M05] bounds canonical selector diagnostics and message lines', () => {
    const results = Array.from({ length: 21 }, (_, requestIndex) => ({
      selector: 'file', requestIndex, path: `src/${requestIndex}.ts`, status: 'error',
      error: { code: 'io_error', message: 'one\ntwo\nthree\nfour\nfive\nsix\nseven', retryable: true, recovery: 'retry' },
    }))
    const result = renderToolComponent(
      createBlock({ paths: results.map((row) => row.path) }, [{ type: 'json', value: {
        kind: 'read_files_result', version: 1, status: 'error',
        summary: { requested: 21, ok: 0, partial: 0, failed: 21, uniquePaths: 21 }, results,
      } }]), chatThemes.dark, renderOptions,
    )
    const markup = renderToStaticMarkup(result?.content as React.ReactElement)
    expect(markup).toContain('src/19.ts')
    expect(markup).not.toContain('✗ src/20.ts')
    expect(markup).toContain('1 selector results hidden')
    expect(markup).toContain('six')
    expect(markup).not.toContain('seven')
  })

  test('renders range and symbol selectors instead of hiding the call', () => {
    const result = renderToolComponent(
      createBlock(
        {
          ranges: [{ path: 'src/a.ts', startLine: 10, endLine: 20 }],
          symbols: [{ path: 'src/b.ts', names: ['run', 'stop'] }],
        },
        [
          {
            type: 'json',
            value: [{ summary: { ok: 2, failed: 0, requested: 2 } }],
          },
        ],
      ),
      chatThemes.dark,
      renderOptions,
    )
    const markup = renderToStaticMarkup(result?.content as React.ReactElement)

    expect(markup).toContain('src/a.ts:10-20')
    expect(markup).toContain('src/b.ts#run|stop')
    expect(markup).not.toContain('pending')
  })

  test('shows pending and failed read states', () => {
    const pending = renderToolComponent(
      createBlock({ paths: ['src/a.ts'] }),
      chatThemes.dark,
      renderOptions,
    )
    const failed = renderToolComponent(
      createBlock({ paths: ['src/a.ts'] }, [
        {
          type: 'json',
          value: [{ summary: { ok: 0, failed: 1, requested: 1 } }],
        },
      ]),
      chatThemes.dark,
      renderOptions,
    )

    expect(
      renderToStaticMarkup(pending?.content as React.ReactElement),
    ).toContain('Read pending')
    expect(
      renderToStaticMarkup(failed?.content as React.ReactElement),
    ).toContain('Read failed')
  })

  test('shows partial when some requested reads succeed and others fail', () => {
    const result = renderToolComponent(
      createBlock({ paths: ['src/a.ts', 'src/missing.ts'] }, [
        {
          type: 'json',
          value: [
            { summary: { ok: 1, failed: 1, requested: 2 } },
            { path: 'src/a.ts', content: 'export const value = 1' },
            {
              path: 'src/missing.ts',
              content: '[FILE_DOES_NOT_EXIST] File not found',
            },
          ],
        },
      ]),
      chatThemes.dark,
      renderOptions,
    )

    expect(
      renderToStaticMarkup(result?.content as React.ReactElement),
    ).toContain('Read partial')
  })

  test('uses canonical v1 status without recursively guessing from payloads', () => {
    const result = renderToolComponent(
      createBlock({ paths: ['src/large.ts'] }, [
        {
          type: 'json',
          value: {
            kind: 'read_files_result',
            version: 1,
            status: 'partial',
            summary: {
              requested: 1,
              ok: 0,
              partial: 1,
              failed: 0,
              uniquePaths: 1,
            },
            results: [
              {
                selector: 'file',
                requestIndex: 0,
                path: 'src/large.ts',
                status: 'partial',
                content: 'visible excerpt',
                complete: false,
                template: false,
                truncation: { reason: 'character_limit' },
              },
            ],
          },
        },
      ]),
      chatThemes.dark,
      renderOptions,
    )

    expect(
      renderToStaticMarkup(result?.content as React.ReactElement),
    ).toContain('Read partial')
  })

  test('treats direct errors, empty envelopes, and missing symbols as failed', () => {
    const cases: unknown[] = [
      { errorMessage: 'read failed directly' },
      [],
      [
        {
          type: 'json',
          value: [{ path: 'src/a.ts', slices: [] }],
        },
      ],
    ]

    for (const outputRaw of cases) {
      const result = renderToolComponent(
        createBlock(
          { symbols: [{ path: 'src/a.ts', names: ['missing'] }] },
          outputRaw,
        ),
        chatThemes.dark,
        renderOptions,
      )
      expect(
        renderToStaticMarkup(result?.content as React.ReactElement),
      ).toContain('Read failed')
    }
  })
})
