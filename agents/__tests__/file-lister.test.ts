import { describe, expect, test } from 'bun:test'

import { createFileLister } from '../file-explorer/file-lister'

import type { AgentState, StepText, ToolCall } from '../types/agent-definition'
import type { ToolResultOutput } from '../types/util-types'

const createMockAgentState = (): AgentState => ({
  agentId: 'file-lister-test',
  runId: 'test-run',
  parentId: undefined,
  messageHistory: [],
  output: undefined,
  systemPrompt: '',
  toolDefinitions: {},
  contextTokenCount: 0,
})

const nextResult = (toolResult?: ToolResultOutput[]) => ({
  agentState: createMockAgentState(),
  toolResult,
  stepsComplete: true,
})

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('file-lister agent', () => {
  test('returns deterministic paths only from requested directories', () => {
    const definition = createFileLister()
    const generator = definition.handleSteps!({
      agentState: createMockAgentState(),
      logger,
      prompt: 'Find React component files',
      params: { directories: ['frontend'] },
    })

    expect((generator.next().value as ToolCall).toolName).toBe('query_index')
    expect(
      (generator.next(nextResult([])).value as ToolCall).toolName,
    ).toBe('read_subtree')

    const result = generator.next(
      nextResult([
        {
          type: 'json',
          value: [
            {
              path: 'frontend',
              type: 'directory',
              printedTree:
                'frontend/\n src/\n  App.tsx\n   App render\n  components/\n   Button.tsx\n    Button\nbackend/\n src/\n  server.ts\n',
            },
          ],
        },
      ]),
    )
    const output = result.value as StepText

    expect(output.type).toBe('STEP_TEXT')
    expect(output.text).toContain('frontend/src/App.tsx')
    expect(output.text).toContain('frontend/src/components/Button.tsx')
    expect(output.text).not.toContain('backend')
  })

  test('falls back to model ranking when subtree output is malformed', () => {
    const definition = createFileLister()
    const generator = definition.handleSteps!({
      agentState: createMockAgentState(),
      logger,
      prompt: 'Find React component files',
      params: { directories: ['frontend'] },
    })

    generator.next()
    generator.next(nextResult([]))
    const result = generator.next(
      nextResult([{ type: 'json', value: { errorMessage: 'read failed' } }]),
    )

    expect(result.value).toBe('STEP')
  })
})
