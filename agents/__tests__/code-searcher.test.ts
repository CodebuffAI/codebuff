import { describe, expect, test } from 'bun:test'

import codeSearcher from '../file-explorer/code-searcher'

import type { AgentState } from '../types/agent-definition'

const createMockAgentState = (): AgentState =>
  ({
    agentId: 'code-searcher-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  }) as AgentState

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('code-searcher agent', () => {
  test('reports malformed params instead of silently returning empty results', () => {
    const generator = codeSearcher.handleSteps!({
      agentState: createMockAgentState(),
      logger: mockLogger as any,
      params: {},
    })

    const result = generator.next().value as any

    expect(result).toMatchObject({
      toolName: 'set_output',
      input: {
        results: [],
      },
      includeToolCall: false,
    })
    expect(result.input.message).toContain('No search ran')
    expect(result.input.message).toContain('searchQueries')
    expect(result.input.message).toContain('params')
    expect(generator.next().done).toBe(true)
  })

  test('skips invalid queries and runs valid queries', () => {
    const generator = codeSearcher.handleSteps!({
      agentState: createMockAgentState(),
      logger: mockLogger as any,
      params: {
        searchQueries: [
          { flags: '-g *.ts' },
          { pattern: 'edit_transaction', flags: '-n -g *.ts' },
        ],
      },
    })

    expect(generator.next().value).toMatchObject({
      toolName: 'code_search',
      input: {
        pattern: 'edit_transaction',
        flags: '-n -g *.ts',
      },
    })

    const output = generator.next({
      agentState: createMockAgentState(),
      toolResult: [
        {
          type: 'json' as const,
          value: {
            stdout: 'Found 1 matches\nfile.ts:\n  Line 1: edit_transaction',
            message: 'Exit code: 0',
          },
        },
      ],
      stepsComplete: true,
    }).value as any

    expect(output).toMatchObject({
      toolName: 'set_output',
      input: {
        results: [
          {
            stdout: 'Found 1 matches\nfile.ts:\n  Line 1: edit_transaction',
            message: 'Exit code: 0',
          },
        ],
      },
      includeToolCall: false,
    })
    expect(output.input.message).toContain('Ran 1 query')
    expect(output.input.message).toContain('1 returned matches')
    expect(output.input.message).toContain('Skipped 1 invalid query')
  })

  test('handleSteps can be serialized for sandbox execution', () => {
    const isolatedHandleSteps = new Function(
      `return (${codeSearcher.handleSteps!.toString()})`,
    )() as NonNullable<typeof codeSearcher.handleSteps>

    const generator = isolatedHandleSteps({
      agentState: createMockAgentState(),
      logger: mockLogger as any,
      params: {},
    })

    const result = generator.next().value as any
    expect(result.toolName).toBe('set_output')
    expect(result.input.message).toContain('searchQueries')
  })
})
