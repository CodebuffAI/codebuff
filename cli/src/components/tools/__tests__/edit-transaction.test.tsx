import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { chatThemes } from '../../../utils/theme-system'
import { renderToolComponent } from '../registry'
import type { ToolBlock } from '../types'

initializeThemeStore()

test('[ERR-M06] transaction renders per-action rollback and failure detail', () => {
  const block = {
    type: 'tool',
    toolName: 'edit_transaction',
    toolCallId: 'tx-1',
    input: { edits: [] },
    outputRaw: [
      {
        type: 'json',
        value: {
          kind: 'file_mutation_result',
          version: 1,
          operationId: 'op-1',
          outcome: 'rollback_incomplete',
          authorityTier: 'portable_path',
          receiptId: 'r-1',
          actions: [
            {
              actionId: 'a',
              index: 0,
              action: 'update',
              path: 'src/a.ts',
              outcome: 'rollback_incomplete',
              beforeHash: 'before',
              afterHash: 'after',
              rollback: { attempted: true, succeeded: false },
              error: {
                code: 'rollback_incomplete',
                message: 'restore failed',
                retryable: true,
                recovery: 'inspect_rollback',
              },
            },
          ],
          errors: [],
          freshCapabilities: [],
        },
      },
    ],
  } as ToolBlock
  const rendered = renderToolComponent(block, chatThemes.dark, {
    availableWidth: 80,
    indentationOffset: 0,
    labelWidth: 0,
  })
  const markup = renderToStaticMarkup(rendered?.content as React.ReactElement)
  expect(markup).toContain('rollback_incomplete')
  expect(markup).toContain('rollback failed')
  expect(markup).toContain('restore failed')
})

test('move actions render source and destination paths', () => {
  const block = {
    type: 'tool',
    toolName: 'edit_transaction',
    toolCallId: 'tx-move',
    input: { edits: [] },
    outputRaw: [
      {
        type: 'json',
        value: {
          kind: 'file_mutation_result',
          version: 1,
          operationId: 'op-move',
          outcome: 'applied',
          authorityTier: 'portable_path',
          receiptId: 'r-move',
          actions: [
            {
              actionId: 'move',
              index: 0,
              action: 'move',
              path: 'src/old.ts',
              destinationPath: 'src/new.ts',
              outcome: 'applied',
              beforeHash: 'before',
              afterHash: 'after',
            },
          ],
          errors: [],
          freshCapabilities: [],
        },
      },
    ],
  } as ToolBlock
  const rendered = renderToolComponent(block, chatThemes.dark, {
    availableWidth: 80,
    indentationOffset: 0,
    labelWidth: 0,
  })
  const markup = renderToStaticMarkup(rendered?.content as React.ReactElement)
  expect(markup).toContain('src/old.ts → src/new.ts')
})

test('legacy transaction failures render one-based detail exactly once', () => {
  const block = {
    type: 'tool',
    toolName: 'edit_transaction',
    toolCallId: 'tx-preflight',
    input: { edits: [] },
    outputRaw: [
      {
        type: 'json',
        value: {
          errorMessage:
            'edit_transaction aborted during preflight at edit 6 of 18.',
          failures: [
            {
              editIndex: 5,
              path: 'src/page.tsx',
              errorMessage: 'oldString was not an exact match',
            },
          ],
        },
      },
    ],
  } as ToolBlock
  const rendered = renderToolComponent(block, chatThemes.dark, {
    availableWidth: 80,
    indentationOffset: 0,
    labelWidth: 0,
  })
  const markup = renderToStaticMarkup(rendered?.content as React.ReactElement)

  expect(markup).toContain('6. src/page.tsx')
  expect(markup.match(/oldString was not an exact match/g)).toHaveLength(1)
})
