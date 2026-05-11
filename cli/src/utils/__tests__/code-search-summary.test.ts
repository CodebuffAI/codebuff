import { describe, expect, test } from 'bun:test'

import {
  countCodeSearchResults,
  getCodeSearcherCollapsedPreview,
} from '../code-search-summary'

import type { AgentContentBlock, ToolContentBlock } from '../../types/chat'

const createCodeSearchToolBlock = (
  output: string,
  id = 'tool-1',
): ToolContentBlock => ({
  type: 'tool',
  toolCallId: id,
  toolName: 'code_search',
  input: { pattern: 'MODEL_ID' },
  output,
})

const createCodeSearcherBlock = (
  options: Partial<AgentContentBlock> = {},
): AgentContentBlock => ({
  type: 'agent',
  agentId: 'agent-1',
  agentName: 'code-searcher',
  agentType: 'code-searcher',
  content: '',
  status: 'complete',
  params: {
    searchQueries: [
      { pattern: 'FREEBUFF_MODEL_SELECTOR_MODELS' },
      { pattern: 'FREEBUFF_MODEL_SELECTOR_MODEL_IDS' },
      { pattern: 'DEFAULT_FREEBUFF_MODEL_ID' },
    ],
  },
  blocks: [],
  ...options,
})

describe('code search summary helpers', () => {
  test('counts formatted code search matches from stdout', () => {
    expect(
      countCodeSearchResults(`stdout: |-
  Found 2 matches
  ./message-block-helpers.ts:
    Line 13: export const getAgentBaseName = (type: string): string => {
    Line 196: getAgentBaseName(options.agentType ?? '') === 'code-searcher'`),
    ).toBe(2)
  })

  test('summarizes collapsed code-searcher searches and results', () => {
    const agentBlock = createCodeSearcherBlock({
      blocks: [
        createCodeSearchToolBlock('Found 7 matches', 'tool-1'),
        createCodeSearchToolBlock('Found 2 matches', 'tool-2'),
        createCodeSearchToolBlock('Found 7 matches', 'tool-3'),
      ],
    })

    expect(getCodeSearcherCollapsedPreview(agentBlock)).toBe(
      '3 searches · 16 results',
    )
  })

  test('shows search count before tool outputs arrive', () => {
    expect(getCodeSearcherCollapsedPreview(createCodeSearcherBlock())).toBe(
      '3 searches',
    )
  })

  test('handles singular labels', () => {
    const agentBlock = createCodeSearcherBlock({
      params: {
        searchQueries: [{ pattern: 'DEFAULT_FREEBUFF_MODEL_ID' }],
      },
      blocks: [createCodeSearchToolBlock('Found 1 match')],
    })

    expect(getCodeSearcherCollapsedPreview(agentBlock)).toBe(
      '1 search · 1 result',
    )
  })
})
