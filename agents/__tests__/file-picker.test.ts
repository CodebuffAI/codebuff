import { describe, test, expect } from 'bun:test'

import filePicker, {
  createFilePicker,
  extractSpawnResults,
  extractAgentText,
  extractErrorMessage,
  isObject,
} from '../file-explorer/file-picker'

import type { AgentState, ToolCall, StepText } from '../types/agent-definition'

describe('file-picker agent', () => {
  const createMockAgentState = (): AgentState => ({
    agentId: 'file-picker-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  })

  const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  })

  describe('definition', () => {
    test('has correct id', () => {
      expect(filePicker.id).toBe('file-picker')
    })

    test('has display name', () => {
      expect(filePicker.displayName).toBe('Fletcher the File Fetcher')
    })

    test('has structured file output', () => {
      expect(filePicker.outputMode).toBe('structured_output')
      expect(filePicker.outputSchema).toBeDefined()
    })

    test('does not include message history', () => {
      expect(filePicker.includeMessageHistory).toBe(false)
    })

    test('has spawn_agents tool', () => {
      expect(filePicker.toolNames).toContain('spawn_agents')
    })

    test('can spawn file-lister agent', () => {
      expect(filePicker.spawnableAgents).toContain('file-lister')
    })

    test('has disabled reasoning', () => {
      expect(filePicker.reasoningOptions?.enabled).toBe(false)
    })
  })

  describe('createFilePicker', () => {
    test('uses flash-lite model', () => {
      const picker = createFilePicker()
      expect(picker.model).toBeUndefined()
    })

    test('spawns single file-lister', () => {
      const picker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = picker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      const result = generator.next()

      const toolCall = result.value as ToolCall<'spawn_agents'>
      expect(toolCall.toolName).toBe('spawn_agents')
      expect(toolCall.input.agents).toHaveLength(1)
      expect(toolCall.input.agents[0].agent_type).toBe('file-lister')
    })
  })

  describe('input schema', () => {
    test('has prompt parameter', () => {
      expect(filePicker.inputSchema?.prompt?.type).toBe('string')
    })

    test('has optional directories parameter', () => {
      const dirSchema = filePicker.inputSchema?.params?.properties?.directories
      const dirSchemaObj =
        dirSchema && typeof dirSchema === 'object' && !Array.isArray(dirSchema)
          ? dirSchema
          : undefined
      expect(dirSchemaObj?.type).toBe('array')
      expect(filePicker.inputSchema?.params?.required).toHaveLength(0)
    })

    test('directories is array of strings', () => {
      const dirSchema = filePicker.inputSchema?.params?.properties?.directories
      const dirSchemaObj =
        dirSchema && typeof dirSchema === 'object' && !Array.isArray(dirSchema)
          ? dirSchema
          : undefined
      const itemsSchema = dirSchemaObj?.items
      const itemsSchemaObj =
        itemsSchema &&
        typeof itemsSchema === 'object' &&
        !Array.isArray(itemsSchema)
          ? (itemsSchema as { type?: string })
          : undefined
      expect(itemsSchemaObj?.type).toBe('string')
    })
  })

  describe('handleStepsDefault', () => {
    test('yields spawn_agents with file-lister', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        prompt: 'Find auth files',
        params: {},
      })

      const result = generator.next()

      const toolCall = result.value as ToolCall<'spawn_agents'>
      expect(toolCall.toolName).toBe('spawn_agents')
      expect(toolCall.input.agents[0].prompt).toBe('Find auth files')
    })

    test('passes params to file-lister', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        prompt: 'Find files',
        params: { directories: ['src', 'lib'] },
      })

      const result = generator.next()

      const toolCall = result.value as ToolCall<'spawn_agents'>
      expect(toolCall.input.agents[0].params).toEqual({
        directories: ['src', 'lib'],
      })
    })

    test('handles empty tool result gracefully', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      // First yield is spawn_agents
      generator.next()

      // Return empty result
      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [] as ToolResultOutput[],
        stepsComplete: true,
      })

      const stepText = result.value as StepText
      expect(stepText.type).toBe('STEP_TEXT')
      expect(stepText.text).toContain('Error')
    })

    test('yields read_files with extracted paths from lastMessage format', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      // First yield is spawn_agents
      generator.next()

      // Mock spawn_agents result - wrapped in toolResult object with production structure
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                agentName: 'File Lister',
                agentType: 'file-lister',
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [
                        { type: 'text', text: 'src/auth.ts\nsrc/login.ts' },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      }

      const result = generator.next(mockToolResult)

      const toolCall = result.value as ToolCall<'read_files'>
      expect(toolCall.toolName).toBe('read_files')
      expect(toolCall.input.paths).toContain('src/auth.ts')
      expect(toolCall.input.paths).toContain('src/login.ts')
    })

    test('yields read_files with extracted paths from structuredOutput format', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                agentName: 'File Lister',
                agentType: 'file-lister',
                value: {
                  type: 'structuredOutput',
                  value: { message: 'src/foo.ts\nsrc/bar.ts' },
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      }

      const result = generator.next(mockToolResult)

      const toolCall = result.value as ToolCall<'read_files'>
      expect(toolCall.toolName).toBe('read_files')
      expect(toolCall.input.paths).toContain('src/foo.ts')
      expect(toolCall.input.paths).toContain('src/bar.ts')
    })

    test('deduplicates paths from results', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      // Result with duplicate paths - wrapped in toolResult with production structure
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                agentName: 'File Lister',
                agentType: 'file-lister',
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'src/file.ts\nsrc/file.ts\nsrc/other.ts',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      }

      const result = generator.next(mockToolResult)

      // Should deduplicate
      const toolCall = result.value as ToolCall<'read_files'>
      const paths = toolCall.input.paths
      expect(paths).toHaveLength(2)
      expect(paths).toContain('src/file.ts')
      expect(paths).toContain('src/other.ts')
    })

    test('yields STEP after read_files', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                agentName: 'File Lister',
                agentType: 'file-lister',
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [{ type: 'text', text: 'src/file.ts' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      }

      // read_files yield
      generator.next(mockToolResult)

      // Next should be STEP
      const result = generator.next()
      expect(result.value).toBe('STEP')
    })

    test('handles error results from spawned agents', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      // Result with error - wrapped in toolResult with production structure
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                agentName: 'File Lister',
                agentType: 'file-lister',
                value: {
                  type: 'error',
                  message: 'File lister failed',
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      }

      const result = generator.next(mockToolResult)

      const stepText = result.value as StepText
      expect(stepText.type).toBe('STEP_TEXT')
      expect(stepText.text).toContain('Error from file-lister')
      expect(stepText.text).toContain('File lister failed')
    })

    test('keeps valid paths when neighboring file-lister lines are malformed', () => {
      const generator = createFilePicker().handleSteps!({
        agentState: createMockAgentState(),
        logger: createMockLogger() as any,
        params: {},
      })
      generator.next()
      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'Files:\n- `src/a.ts`\nhttps://example.com\n2. src/b.ts',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      })
      expect((result.value as ToolCall<'read_files'>).input.paths).toEqual([
        'src/a.ts',
        'src/b.ts',
      ])
    })

    test('enforces requested directory scope on returned candidates', () => {
      const generator = createFilePicker().handleSteps!({
        agentState: createMockAgentState(),
        logger: createMockLogger() as any,
        params: { directories: ['packages/sdk'] },
      })
      generator.next()
      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'packages/sdk/a.ts\ncli/src/outside.ts',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      })
      expect((result.value as ToolCall<'read_files'>).input.paths).toEqual([
        'packages/sdk/a.ts',
      ])
    })

    // M2.2: relevance scoring orders paths by prompt-keyword matches, and caps
    // to the top 12 (matching the spawner prompt's advertised limit).
    test('orders paths by prompt-keyword relevance', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        prompt: 'Find auth files',
        params: {},
      })

      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                agentName: 'File Lister',
                agentType: 'file-lister',
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'src/unrelated.ts\nsrc/auth/login.ts\nsrc/auth/session.ts\nsrc/utils/helpers.ts',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      }

      const result = generator.next(mockToolResult)

      const toolCall = result.value as ToolCall<'read_files'>
      expect(toolCall.toolName).toBe('read_files')
      const paths = toolCall.input.paths
      // auth-bearing paths score higher than unrelated/utils paths.
      expect(paths[0]).toBe('src/auth/login.ts')
      expect(paths[1]).toBe('src/auth/session.ts')
      // The two non-auth files retain the file-lister's upstream rank.
      expect(paths).toContain('src/unrelated.ts')
      expect(paths).toContain('src/utils/helpers.ts')
      expect(paths).toHaveLength(4)
    })

    test('caps to top 12 paths when more candidates are returned', () => {
      const defaultPicker = createFilePicker()
      const mockAgentState = createMockAgentState()
      const mockLogger = createMockLogger()

      const generator = defaultPicker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        prompt: 'search',
        params: {},
      })

      generator.next()

      // 15 candidate paths — should be capped to 12.
      const fifteenPaths = Array.from(
        { length: 15 },
        (_, i) => `src/file${i}.ts`,
      ).join('\n')
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                agentName: 'File Lister',
                agentType: 'file-lister',
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [{ type: 'text', text: fifteenPaths }],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      }

      const result = generator.next(mockToolResult)

      const toolCall = result.value as ToolCall<'read_files'>
      expect(toolCall.toolName).toBe('read_files')
      expect(toolCall.input.paths).toHaveLength(12)
    })
  })

  describe('serialization', () => {
    test('handleSteps can be serialized for default mode', () => {
      const defaultPicker = createFilePicker()
      const handleStepsString = defaultPicker.handleSteps!.toString()

      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')
    })

    test('serialized default handleSteps does not reference closure helpers', () => {
      const defaultPicker = createFilePicker()
      const isolatedFunction = new Function(
        `return (${defaultPicker.handleSteps!.toString()})`,
      )()
      const generator = isolatedFunction({
        agentState: createMockAgentState(),
        logger: createMockLogger(),
        params: {},
      })

      generator.next()
      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                value: {
                  type: 'lastMessage',
                  value: [
                    {
                      role: 'assistant',
                      content: [{ type: 'text', text: 'src/isolated.ts' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
        stepsComplete: true,
      })

      const toolCall = result.value as ToolCall<'read_files'>
      expect(toolCall.toolName).toBe('read_files')
      expect(toolCall.input.paths).toEqual(['src/isolated.ts'])
    })
  })

  describe('system prompt', () => {
    test('contains file tree placeholder', () => {
      expect(filePicker.systemPrompt).toContain('{CODEBUFF_FILE_TREE_PROMPT}')
    })

    test('describes file finding purpose', () => {
      expect(filePicker.systemPrompt).toContain('finding')
    })
  })

  describe('instructions prompt', () => {
    test('asks for short report', () => {
      expect(filePicker.instructionsPrompt).toContain('short report')
    })

    test('requests full paths', () => {
      expect(filePicker.instructionsPrompt).toContain('full path')
    })

    test('instructs not to use tools', () => {
      expect(filePicker.instructionsPrompt).toContain('Do not use')
    })
  })

  describe('spawner prompt', () => {
    test('mentions finding relevant files', () => {
      expect(filePicker.spawnerPrompt).toContain('relevant files')
    })

    test('mentions up to 12 file paths', () => {
      expect(filePicker.spawnerPrompt).toContain('12')
    })

    test('mentions fuzzy search', () => {
      expect(filePicker.spawnerPrompt).toContain('fuzzy')
    })
  })

  describe('extractAgentText', () => {
    test('extracts text from lastMessage format', () => {
      const result = extractAgentText({
        type: 'lastMessage',
        value: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'src/auth.ts\nsrc/login.ts' }],
          },
        ],
      })
      expect(result).toBe('src/auth.ts\nsrc/login.ts')
    })

    test('extracts text from allMessages format', () => {
      const result = extractAgentText({
        type: 'allMessages',
        value: [
          { role: 'user', content: [{ type: 'text', text: 'find files' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'src/user.ts\nsrc/config.ts' }],
          },
        ],
      })
      expect(result).toBe('src/user.ts\nsrc/config.ts')
    })

    test('extracts text from structuredOutput with string value', () => {
      const result = extractAgentText({
        type: 'structuredOutput',
        value: 'src/foo.ts\nsrc/bar.ts',
      })
      expect(result).toBe('src/foo.ts\nsrc/bar.ts')
    })

    test('extracts text from structuredOutput with message field', () => {
      const result = extractAgentText({
        type: 'structuredOutput',
        value: { message: 'src/baz.ts\nsrc/qux.ts' },
      })
      expect(result).toBe('src/baz.ts\nsrc/qux.ts')
    })

    test('extracts text from structuredOutput with text field', () => {
      const result = extractAgentText({
        type: 'structuredOutput',
        value: { text: 'src/a.ts\nsrc/b.ts' },
      })
      expect(result).toBe('src/a.ts\nsrc/b.ts')
    })

    test('extracts text from structuredOutput with content field', () => {
      const result = extractAgentText({
        type: 'structuredOutput',
        value: { content: 'src/c.ts\nsrc/d.ts' },
      })
      expect(result).toBe('src/c.ts\nsrc/d.ts')
    })

    test('extracts text from structuredOutput with output field', () => {
      const result = extractAgentText({
        type: 'structuredOutput',
        value: { output: 'src/e.ts\nsrc/f.ts' },
      })
      expect(result).toBe('src/e.ts\nsrc/f.ts')
    })

    test('extracts text from structuredOutput with response field', () => {
      const result = extractAgentText({
        type: 'structuredOutput',
        value: { response: 'src/g.ts\nsrc/h.ts' },
      })
      expect(result).toBe('src/g.ts\nsrc/h.ts')
    })

    test('extracts text from direct string', () => {
      const result = extractAgentText('src/direct.ts\nsrc/string.ts')
      expect(result).toBe('src/direct.ts\nsrc/string.ts')
    })

    test('returns null for null input', () => {
      expect(extractAgentText(null)).toBeNull()
    })

    test('returns null for undefined input', () => {
      expect(extractAgentText(undefined)).toBeNull()
    })

    test('returns null for unknown type', () => {
      const result = extractAgentText({
        type: 'unknown',
        value: 'some value',
      })
      expect(result).toBeNull()
    })

    test('returns null for structuredOutput with no text fields', () => {
      const result = extractAgentText({
        type: 'structuredOutput',
        value: { unrelated: true, count: 42 },
      })
      expect(result).toBeNull()
    })
  })

  describe('extractSpawnResults', () => {
    test('extracts agent values from json tool result', () => {
      const results = extractSpawnResults([
        {
          type: 'json',
          value: [
            {
              agentName: 'Test',
              agentType: 'file-lister',
              value: { type: 'lastMessage', value: [] },
            },
          ],
        },
      ])

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({ type: 'lastMessage', value: [] })
    })

    test('returns empty array for empty input', () => {
      expect(extractSpawnResults([])).toEqual([])
    })

    test('returns empty array for undefined input', () => {
      expect(extractSpawnResults(undefined)).toEqual([])
    })

    test('returns empty array when no json result found', () => {
      expect(extractSpawnResults([{ type: 'string', value: 'hello' }])).toEqual(
        [],
      )
    })
  })

  describe('extractErrorMessage', () => {
    test('extracts message from error result', () => {
      expect(
        extractErrorMessage({ type: 'error', message: 'Something failed' }),
      ).toBe('Something failed')
    })

    test('falls back to value if no message', () => {
      expect(extractErrorMessage({ type: 'error', value: 'Error value' })).toBe(
        'Error value',
      )
    })

    test('returns null for non-error types', () => {
      expect(extractErrorMessage({ type: 'lastMessage', value: [] })).toBeNull()
    })

    test('returns null for null input', () => {
      expect(extractErrorMessage(null)).toBeNull()
    })
  })

  describe('isObject', () => {
    test('returns true for plain objects', () => {
      expect(isObject({ a: 1 })).toBe(true)
    })

    test('returns false for arrays', () => {
      expect(isObject([1, 2, 3])).toBe(false)
    })

    test('returns false for null', () => {
      expect(isObject(null)).toBe(false)
    })

    test('returns false for strings', () => {
      expect(isObject('hello')).toBe(false)
    })

    test('returns false for numbers', () => {
      expect(isObject(42)).toBe(false)
    })
  })
})
