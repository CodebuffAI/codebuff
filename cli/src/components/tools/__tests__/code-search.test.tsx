import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { CodeSearchComponent } from '../code-search'

import type { ChatTheme } from '../../../types/theme-system'
import type { ToolBlock } from '../types'

initializeThemeStore()

const createToolBlock = (
  output?: string,
): ToolBlock & { toolName: 'code_search' } => ({
  type: 'tool',
  toolName: 'code_search',
  toolCallId: 'code-search-test',
  input: {
    pattern: 'getAgentBaseName',
    cwd: 'cli/src/utils',
  },
  output,
})

describe('CodeSearchComponent', () => {
  test('uses formatted match count from current code search output', () => {
    const result = CodeSearchComponent.render(
      createToolBlock(`Found 2 matches
./message-block-helpers.ts:
Line 13: export const getAgentBaseName = (type: string): string => {
Line 196: getAgentBaseName(options.agentType ?? '') === 'code-searcher'`),
      {} as ChatTheme,
      {
        availableWidth: 80,
        indentationOffset: 0,
        labelWidth: 10,
      },
    )

    const markup = renderToStaticMarkup(<>{result.content}</>)

    expect(markup).toContain('getAgentBaseName in cli/src/utils (2 results)')
  })
})
