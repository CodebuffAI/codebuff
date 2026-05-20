import { describe, expect, test } from 'bun:test'

import {
  getAgentDisplayPrompt,
  getBasherFinishedOutputPreview,
  truncateToSingleLinePreview,
} from '../agent-display'

import type { AgentContentBlock } from '../../types/chat'

const createAgentBlock = (
  overrides: Partial<AgentContentBlock>,
): AgentContentBlock => ({
  type: 'agent',
  agentId: 'agent-1',
  agentName: 'Basher',
  agentType: 'basher',
  content: '',
  status: 'running',
  blocks: [],
  initialPrompt: '',
  ...overrides,
})

describe('getAgentDisplayPrompt', () => {
  test('uses initial prompt when present', () => {
    const block = createAgentBlock({
      initialPrompt: 'Run tests',
      params: {
        what_to_summarize: 'Summarize failures',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBe('Run tests')
  })

  test('uses basher what_to_summarize when prompt is omitted', () => {
    const block = createAgentBlock({
      params: {
        command: 'bun test',
        what_to_summarize: 'Summarize failing tests only',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBe('Summarize failing tests only')
  })

  test('normalizes scoped and versioned basher agent ids', () => {
    const block = createAgentBlock({
      agentType: 'codebuff/basher@1.0.0',
      params: {
        what_to_summarize: 'Summarize command output',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBe('Summarize command output')
  })

  test('ignores non-basher what_to_summarize params', () => {
    const block = createAgentBlock({
      agentName: 'code-searcher',
      agentType: 'code-searcher',
      params: {
        what_to_summarize: 'This is not a basher prompt',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBeUndefined()
  })
})

describe('getBasherFinishedOutputPreview', () => {
  test('returns undefined while basher is still running', () => {
    const block = createAgentBlock({
      status: 'running',
      params: {
        what_to_summarize: 'Report the test result',
      },
      blocks: [{ type: 'text', content: 'Tests passed' }],
    })

    expect(getBasherFinishedOutputPreview(block)).toBeUndefined()
  })

  test('uses finished basher text output before what_to_summarize', () => {
    const block = createAgentBlock({
      status: 'complete',
      params: {
        what_to_summarize: 'Report the test result',
      },
      blocks: [
        {
          type: 'text',
          content: 'Tests passed\n42 assertions completed',
          textType: 'text',
        },
      ],
    })

    expect(getBasherFinishedOutputPreview(block)).toBe(
      'Tests passed 42 assertions completed',
    )
  })

  test('falls back to command output when no text block exists', () => {
    const block = createAgentBlock({
      status: 'complete',
      blocks: [
        {
          type: 'tool',
          toolCallId: 'tool-1',
          toolName: 'run_terminal_command',
          input: { command: 'git status --short' },
          output: ' M cli/src/app.tsx\n',
        },
      ],
    })

    expect(getBasherFinishedOutputPreview(block)).toBe('M cli/src/app.tsx')
  })

  test('ignores non-basher output', () => {
    const block = createAgentBlock({
      agentType: 'code-searcher',
      status: 'complete',
      blocks: [{ type: 'text', content: 'Search results' }],
    })

    expect(getBasherFinishedOutputPreview(block)).toBeUndefined()
  })
})

describe('truncateToSingleLinePreview', () => {
  test('collapses whitespace and truncates to the requested length', () => {
    expect(truncateToSingleLinePreview('one\ntwo   three four', 13)).toBe(
      'one two th...',
    )
  })
})
