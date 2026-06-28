import { describe, test, expect } from 'bun:test'

import commander from '../basher'

import type { AgentState } from '../types/agent-definition'
import type { ToolResultOutput } from '../types/util-types'

describe('commander agent', () => {
  const createMockAgentState = (): AgentState => ({
    agentId: 'commander-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  })

  describe('definition', () => {
    test('has correct id', () => {
      expect(commander.id).toBe('basher')
    })

    test('has display name', () => {
      expect(commander.displayName).toBe('Basher')
    })

    test('uses flash-lite model', () => {
      expect(commander.model).toBeUndefined()
    })

    test('has output mode set to structured_output', () => {
      expect(commander.outputMode).toBe('structured_output')
    })

    test('does not include message history', () => {
      expect(commander.includeMessageHistory).toBe(false)
    })

    test('has run_terminal_command tool', () => {
      expect(commander.toolNames).toContain('run_terminal_command')
      expect(commander.toolNames).toHaveLength(1)
    })
  })

  describe('input schema', () => {
    test('requires command parameter', () => {
      const schema = commander.inputSchema
      const commandProp = schema?.params?.properties?.command
      expect(
        commandProp &&
          typeof commandProp === 'object' &&
          'type' in commandProp &&
          commandProp.type,
      ).toBe('string')
      expect(schema?.params?.required).toContain('command')
    })

    test('has optional timeout_seconds parameter', () => {
      const schema = commander.inputSchema
      const timeoutProp = schema?.params?.properties?.timeout_seconds
      expect(
        timeoutProp &&
          typeof timeoutProp === 'object' &&
          'type' in timeoutProp &&
          timeoutProp.type,
      ).toBe('number')
      expect(schema?.params?.required).not.toContain('timeout_seconds')
    })

    test('has optional what_to_summarize parameter', () => {
      const schema = commander.inputSchema
      const summarizeProp = schema?.params?.properties?.what_to_summarize
      expect(
        summarizeProp &&
          typeof summarizeProp === 'object' &&
          'type' in summarizeProp &&
          summarizeProp.type,
      ).toBe('string')
      expect(schema?.params?.required).not.toContain('what_to_summarize')
    })

    test('has optional full log capture parameters', () => {
      const schema = commander.inputSchema
      const saveFullLogProp = schema?.params?.properties?.save_full_log
      const failurePatternProp = schema?.params?.properties?.failure_pattern
      const maxFailureLinesProp = schema?.params?.properties?.max_failure_lines

      expect(
        saveFullLogProp &&
          typeof saveFullLogProp === 'object' &&
          'type' in saveFullLogProp &&
          saveFullLogProp.type,
      ).toBe('boolean')
      expect(
        failurePatternProp &&
          typeof failurePatternProp === 'object' &&
          'type' in failurePatternProp &&
          failurePatternProp.type,
      ).toBe('string')
      expect(
        maxFailureLinesProp &&
          typeof maxFailureLinesProp === 'object' &&
          'type' in maxFailureLinesProp &&
          maxFailureLinesProp.type,
      ).toBe('number')
      expect(schema?.params?.required).not.toContain('save_full_log')
      expect(schema?.params?.required).not.toContain('failure_pattern')
      expect(schema?.params?.required).not.toContain('max_failure_lines')
    })
  })

  describe('handleSteps', () => {
    test('returns error when no command provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      const result = generator.next()

      const toolCall = result.value as {
        toolName: string
        input: { data: { errorMessage: string } }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.data.errorMessage).toContain('command')
    })

    test('yields run_terminal_command with basic command', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'ls -la' },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'ls -la',
        },
      })
    })

    test('yields run_terminal_command with timeout', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'sleep 10', timeout_seconds: 60 },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'sleep 10',
          timeout_seconds: 60,
        },
      })
    })

    test('yields set_output with raw result when what_to_summarize is not provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo hello' },
      })

      // First yield is the command
      generator.next()

      // Second yield should be set_output with the result
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: { stdout: 'hello' } }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { data: { stdout: string } }
        includeToolCall?: boolean
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.data).toEqual({ stdout: 'hello' })
      expect(toolCall.includeToolCall).toBe(false)
      expect(result.done).toBe(false)

      // Next should be done
      const final = generator.next()
      expect(final.done).toBe(true)
    })

    test('returns deterministic command report when what_to_summarize is provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'ls -la', what_to_summarize: 'list of files' },
      })

      // First yield is the command, excluded from model history because this is
      // a programmatic tool call rather than a provider-generated one.
      expect(generator.next().value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'ls -la',
        },
        includeToolCall: false,
      })

      // Second yield should add a plain-text summary prompt for model analysis.
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: { stdout: 'file1.txt\nfile2.txt', exitCode: 0 },
          },
        ],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { data: { message: string } }
        includeToolCall?: boolean
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.data.message).toContain('Command: ls -la')
      expect(toolCall.input.data.message).toContain(
        'Requested summary: list of files',
      )
      expect(toolCall.input.data.message).toContain('Exit code: 0')
      expect(toolCall.input.data.message).toContain('file1.txt\nfile2.txt')
      expect(toolCall.includeToolCall).toBe(false)

      // No provider STEP is needed just to summarize command output.
      expect(generator.next().done).toBe(true)
    })

    test('wraps sync commands when full log capture is requested', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {
          command: "bun test 'quoted file.test.ts'",
          what_to_summarize: 'test failures',
          save_full_log: true,
          failure_pattern: 'FAIL|Expected',
          max_failure_lines: 7,
        },
      })

      const firstYield = generator.next().value as {
        toolName: string
        input: { command: string }
        includeToolCall?: boolean
      }
      expect(firstYield.toolName).toBe('run_terminal_command')
      expect(firstYield.includeToolCall).toBe(false)
      expect(firstYield.input.command).toContain('set -o pipefail')
      expect(firstYield.input.command).toContain(
        "(bun test 'quoted file.test.ts') 2>&1 | tee '/tmp/openbuff-basher-",
      )
      expect(firstYield.input.command).toContain("grep -n -E 'FAIL|Expected'")
      expect(firstYield.input.command).toContain('head -7')
      expect(firstYield.input.command).toContain('exit "$status"')

      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              stdout:
                'full_log_path=/tmp/openbuff-basher-test.log\nexit_status=1\n10:Expected 1 received 2',
              exitCode: 1,
            },
          },
        ],
        stepsComplete: true,
      })

      const toolCall = result.value as {
        toolName: string
        input: { data: { message: string } }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.data.message).toContain('Command: bun test')
      expect(toolCall.input.data.message).toContain('Full log: /tmp/openbuff-basher-')
      expect(toolCall.input.data.message).toContain('Failure pattern: FAIL|Expected')
      expect(toolCall.input.data.message).toContain('Max failure lines: 7')
      expect(toolCall.input.data.message).toContain('10:Expected 1 received 2')
    })

    test('includes background job fields in deterministic report', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {
          command: 'bun dev',
          process_type: 'BACKGROUND',
          what_to_summarize: 'dev server startup',
        },
      })

      expect(generator.next().value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'bun dev',
          process_type: 'BACKGROUND',
        },
        includeToolCall: false,
      })

      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              command: 'bun dev',
              processId: 123,
              backgroundProcessStatus: 'running',
              jobId: 'job-1-1',
              logFile: '/tmp/openbuff-job-1-1.log',
            },
          },
        ],
        stepsComplete: true,
      })

      const toolCall = result.value as {
        toolName: string
        input: { data: { message: string } }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.data.message).toContain('Job ID: job-1-1')
      expect(toolCall.input.data.message).toContain(
        'Background status: running',
      )
      expect(toolCall.input.data.message).toContain(
        'Log file: /tmp/openbuff-job-1-1.log',
      )
    })

    test('handles empty tool result gracefully', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test' },
      })

      // First yield is the command
      generator.next()

      // Second yield with empty result
      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [] as ToolResultOutput[],
        stepsComplete: true,
      })

      const toolCall = result.value as {
        toolName: string
        input: { data: { message: string } }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.data.message).toBe('')
    })

    test('handles non-json tool result', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test' },
      })

      // First yield is the command
      generator.next()

      // Second yield with non-json result
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: 'plain text output' }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { data: { message: string } }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.data.message).toBe('')
    })

    test('handleSteps can be serialized for sandbox execution', () => {
      const handleStepsString = commander.handleSteps!.toString()

      // Verify it's a valid generator function string
      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      // Should be able to create a new function from it
      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')
    })
  })

  describe('system prompt', () => {
    test('contains command analysis instructions', () => {
      expect(commander.systemPrompt).toContain('terminal command')
      expect(commander.systemPrompt).toContain('output')
    })

    test('contains concise description requirement', () => {
      expect(commander.systemPrompt).toContain('concise')
    })
  })

  describe('instructions prompt', () => {
    test('instructs not to use tools', () => {
      expect(commander.instructionsPrompt).toContain('Do not use any tools')
    })

    test('mentions analyzing command output', () => {
      expect(commander.instructionsPrompt).toContain('command')
      expect(commander.instructionsPrompt).toContain('output')
    })
  })
})
