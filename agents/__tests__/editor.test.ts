import { describe, test, expect } from 'bun:test'

import editor, { createCodeEditor } from '../editor/editor'

import type { AgentState } from '../types/agent-definition'

describe('editor agent', () => {
  const withCommittedReceipt = (value: any) => {
    const receiptId = `${value.operationId}:receipt`
    return {
      ...value,
      receiptId,
      authorityReceipt: {
        kind: 'commit_receipt',
        version: 1,
        receiptId,
        operationId: value.operationId,
        callId: `${value.operationId}:call`,
        authorityTier: value.authorityTier,
        status: 'committed',
        actions: value.actions.map((action: any) => ({
          ...action,
          status: 'committed',
        })),
        finalHashes: Object.fromEntries(
          value.actions.map((action: any) => [action.path, action.afterHash]),
        ),
      },
    }
  }
  const createMockAgentState = (messageHistory: any[] = []): AgentState => ({
    agentId: 'editor-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory,
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  })

  describe('default editor definition', () => {
    test('has correct id', () => {
      expect(editor.id).toBe('editor')
    })

    test('has display name', () => {
      expect(editor.displayName).toBe('Code Editor')
    })

    test('uses opus model by default', () => {
      expect(editor.model).toBe('anthropic/claude-opus-4.7')
    })

    test('has output mode set to structured_output', () => {
      expect(editor.outputMode).toBe('structured_output')
    })

    test('does not include parent message history', () => {
      expect(editor.includeMessageHistory).toBe(false)
    })

    test('does not inherit parent system prompt orchestration duties', () => {
      expect(editor.inheritParentSystemPrompt).toBe(false)
    })

    test('documents structured implementation briefs', () => {
      expect(editor.spawnerPrompt).toContain(
        'compact, self-contained implementation brief',
      )
      expect(editor.spawnerPrompt).toContain('requirements, target files')
      expect(editor.spawnerPrompt).toContain(
        'Do not include validation commands',
      )
      expect(editor.spawnerPrompt).not.toContain(
        'expected validation, and risks',
      )
      expect(editor.spawnerPrompt).not.toContain(
        'inherits the context of the entire conversation',
      )
      expect(editor.instructionsPrompt).toContain(
        "Treat the spawn prompt's implementation-scoped requirements",
      )
      expect(editor.instructionsPrompt).toContain(
        'Do not perform or attempt parent-orchestrator responsibilities',
      )
      expect(editor.instructionsPrompt).toContain('You cannot run validation')
      expect(editor.instructionsPrompt).toContain(
        'shell-based cleanup/deletion',
      )
      expect(editor.instructionsPrompt).toContain(
        'parent responsibilities after you return',
      )
      expect(editor.instructionsPrompt).toContain('If edit_transaction aborts')
      expect(editor.instructionsPrompt).toContain(
        'rebuild the whole related transaction',
      )
      expect(editor.instructionsPrompt).toContain(
        'Never use ultra-broad anchors',
      )
      expect(editor.instructionsPrompt).toContain('many occurrences')
      expect(editor.instructionsPrompt).toContain('Do not create scratch')
      expect(editor.instructionsPrompt).toContain('Code Craftsmanship')
      expect(editor.instructionsPrompt).not.toContain(
        'run configured validation hooks',
      )
      expect(editor.instructionsPrompt).not.toContain('Spawn a code-reviewer')
      expect(editor.instructionsPrompt).not.toContain('git push')
      expect(editor.instructionsPrompt).not.toContain('basher')
    })

    test('has correct tool names', () => {
      expect(editor.toolNames).toEqual([
        'read_files',
        'read_outline',
        'edit_transaction',
      ])
      expect(editor.toolNames).not.toContain('set_output')
      expect(editor.toolNames).not.toContain('write_file')
      expect(editor.toolNames).not.toContain('str_replace')
      expect(editor.toolNames).not.toContain('replace_range')
      expect(editor.toolNames).not.toContain('rewrite_symbol')
      expect(editor.toolNames).not.toContain('apply_patch')
      expect(editor.toolNames).not.toContain('read_slices')
    })
  })

  describe('createCodeEditor', () => {
    test('creates opus editor by default', () => {
      const opusEditor = createCodeEditor({ model: 'opus' })
      expect(opusEditor.model).toBe('anthropic/claude-opus-4.7')
    })

    test('creates gpt-5 editor', () => {
      const gpt5Editor = createCodeEditor({ model: 'gpt-5' })
      expect(gpt5Editor.model).toBe('openai/gpt-5.3')
    })

    test('creates glm editor', () => {
      const glmEditor = createCodeEditor({ model: 'glm' })
      expect(glmEditor.model).toBe('z-ai/glm-4.7')
    })

    test('creates kimi editor', () => {
      const kimiEditor = createCodeEditor({ model: 'kimi' })
      expect(kimiEditor.model).toBe('moonshotai/kimi-k2.6')
    })

    test('creates deepseek editor', () => {
      const deepseekEditor = createCodeEditor({ model: 'deepseek' })
      expect(deepseekEditor.model).toBe('deepseek/deepseek-v4-pro')
    })

    test('creates minimax editor', () => {
      const minimaxEditor = createCodeEditor({ model: 'minimax' })
      expect(minimaxEditor.model).toBe('minimax/minimax-m2.7')
    })

    test('non-opus editors do not include think tags in instructions', () => {
      for (const model of [
        'gpt-5',
        'glm',
        'kimi',
        'deepseek',
        'minimax',
      ] as const) {
        const codeEditor = createCodeEditor({ model })
        expect(codeEditor.instructionsPrompt).not.toContain('<think>')
        expect(codeEditor.instructionsPrompt).not.toContain('</think>')
      }
    })

    test('opus editor includes think tags in instructions', () => {
      const opusEditor = createCodeEditor({ model: 'opus' })
      expect(opusEditor.instructionsPrompt).toContain('<think>')
      expect(opusEditor.instructionsPrompt).toContain('</think>')
    })

    test('all variants have same base properties', () => {
      const opusEditor = createCodeEditor({ model: 'opus' })
      const gpt5Editor = createCodeEditor({ model: 'gpt-5' })
      const glmEditor = createCodeEditor({ model: 'glm' })

      expect(opusEditor.displayName).toBe(gpt5Editor.displayName)
      expect(gpt5Editor.displayName).toBe(glmEditor.displayName)
      expect(opusEditor.outputMode).toBe(gpt5Editor.outputMode)
      expect(gpt5Editor.outputMode).toBe(glmEditor.outputMode)
      expect(opusEditor.toolNames).toEqual(gpt5Editor.toolNames)
      expect(gpt5Editor.toolNames).toEqual(glmEditor.toolNames)
    })
  })

  describe('instructions prompt', () => {
    test('contains str_replace format example', () => {
      expect(editor.instructionsPrompt).toContain('str_replace')
      expect(editor.instructionsPrompt).toContain('replacements')
      expect(editor.instructionsPrompt).toContain('"oldString"')
      expect(editor.instructionsPrompt).toContain('"newString"')
      expect(editor.instructionsPrompt).not.toContain('    },\n  ]')
    })

    test('contains replace_range guidance and format example', () => {
      expect(editor.instructionsPrompt).toContain('replace_range')
      expect(editor.instructionsPrompt).toContain('editAnchor.readCapability')
      expect(editor.instructionsPrompt).toContain('"type": "replace_range"')
      expect(editor.instructionsPrompt).toContain('"readCapability"')
      expect(editor.instructionsPrompt).not.toContain(
        '"cb_tool_name": "replace_range"',
      )
      expect(editor.instructionsPrompt).not.toContain('"expectedHash"')
      expect(editor.instructionsPrompt).toContain('"newContent"')
    })

    test('contains write_file format example', () => {
      expect(editor.instructionsPrompt).toContain('write_file')
      expect(editor.instructionsPrompt).toContain('content')
    })

    test('contains edit_transaction format example', () => {
      expect(editor.instructionsPrompt).toContain(
        '"cb_tool_name": "edit_transaction"',
      )
      expect(editor.instructionsPrompt).toContain('preflight together')
      expect(editor.instructionsPrompt).toContain('"edits"')
      expect(editor.instructionsPrompt).toContain('"type": "str_replace"')
      expect(editor.instructionsPrompt).toContain('"type": "structured"')
      expect(editor.instructionsPrompt).toContain('"oldString"')
      expect(editor.instructionsPrompt).toContain('"newString"')
      expect(editor.instructionsPrompt).toContain('insert_import')
    })

    test('contains codebuff_tool_call format', () => {
      expect(editor.instructionsPrompt).toContain('<codebuff_tool_call>')
      expect(editor.instructionsPrompt).toContain('</codebuff_tool_call>')
    })

    test('instructs not to call set_output', () => {
      expect(editor.instructionsPrompt).toContain('set_output')
      expect(editor.instructionsPrompt).toContain('should not be used')
    })

    test('mentions being an expert code editor', () => {
      expect(editor.instructionsPrompt).toContain('expert code editor')
    })

    test('mentions comprehensive changes', () => {
      expect(editor.instructionsPrompt).toContain('comprehensive')
    })

    test('mentions project conventions', () => {
      expect(editor.instructionsPrompt).toContain('conventions')
    })
  })

  describe('spawner prompt', () => {
    test('describes the editor purpose', () => {
      expect(editor.spawnerPrompt).toContain('code changes')
    })

    test('requires an implementation-only spawn prompt', () => {
      expect(editor.spawnerPrompt).toContain('Spawn this agent with a compact')
      expect(editor.includeMessageHistory).toBe(false)
      expect(editor.spawnerPrompt).not.toContain(
        'Do not specify an input prompt',
      )
    })

    test('mentions reading files for target context', () => {
      expect(editor.spawnerPrompt).toContain('read')
      expect(editor.spawnerPrompt).toContain('files')
      expect(editor.spawnerPrompt).toContain('recover')
    })
  })

  describe('handleSteps', () => {
    test('yields STEP with initial state tracking', () => {
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')
    })

    test('captures new messages after STEP', () => {
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState([
        ...initialMessages,
        { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as {
        toolName: string
        input: { output: { messages: any[] } }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output.messages).toHaveLength(1)
      expect(toolCall.input.output.messages[0].role).toBe('assistant')
    })

    test('returns only new messages in output', () => {
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Message 1' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Response 1' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState([
        ...initialMessages,
        { role: 'user', content: [{ type: 'text', text: 'Message 2' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Response 2' }] },
        { role: 'user', content: [{ type: 'text', text: 'Message 3' }] },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as {
        input: { output: { messages: any[] } }
      }
      expect(toolCall.input.output.messages).toHaveLength(3)
      expect(toolCall.input.output.messages[0].content[0].text).toBe(
        'Message 2',
      )
    })

    test('handleSteps can be serialized for sandbox execution', () => {
      const handleStepsString = editor.handleSteps!.toString()
      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')
    })

    test('outputs correct structure for set_output', () => {
      const mockAgentState = createMockAgentState([])
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const result = generator.next({
        agentState: createMockAgentState([
          { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
        ]),
        toolResult: undefined,
        stepsComplete: true,
      })

      expect(result.value).toEqual({
        toolName: 'set_output',
        input: {
          output: {
            status: 'blocked',
            messages: [
              { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
            ],
            changedFiles: [],
            requirementsAddressed: [],
            acceptanceCriteriaAddressed: [],
            findingsAddressed: [],
            unresolved: [],
            requestedValidation: [],
          },
        },
        includeToolCall: false,
      })
    })

    test('does not report non-edit tool result file fields as changed files', () => {
      const mockAgentState = createMockAgentState([])
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState([
        {
          role: 'tool',
          toolName: 'read_files',
          content: [
            {
              type: 'json',
              value: {
                file: 'src/read-only.ts',
                path: 'src/read-only.ts',
                errorMessage: 'read_files failed',
              },
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      expect((result.value as any).input.output.changedFiles).toEqual([])
    })

    test('reports apply_patch and apply_smart_patch paths as changed files', () => {
      const mockAgentState = createMockAgentState([])
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState([
        {
          role: 'tool',
          toolName: 'edit_transaction',
          content: [
            {
              type: 'json',
              value: withCommittedReceipt({
                kind: 'file_mutation_result',
                version: 1,
                operationId: 'editor-multi',
                outcome: 'applied',
                authorityTier: 'portable_path',
                actions: [
                  {
                    actionId: 'a',
                    index: 0,
                    action: 'update',
                    path: 'src/from-apply-patch.ts',
                    outcome: 'applied',
                    beforeHash: 'before',
                    afterHash: 'after',
                  },
                  {
                    actionId: 'b',
                    index: 1,
                    action: 'update',
                    path: 'src/from-smart-patch.ts',
                    outcome: 'applied',
                    beforeHash: 'before',
                    afterHash: 'after',
                  },
                ],
                errors: [],
                freshCapabilities: [],
              }),
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      expect((result.value as any).input.output.changedFiles).toEqual([
        'src/from-apply-patch.ts',
        'src/from-smart-patch.ts',
      ])
    })

    test('reports changed files from a standalone commit_receipt artifact', () => {
      const mockAgentState = createMockAgentState([])
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState([
        {
          role: 'tool',
          toolName: 'edit_transaction',
          content: [
            {
              type: 'json',
              value: {
                kind: 'commit_receipt',
                version: 1,
                receiptId: 'standalone-commit',
                operationId: 'op-standalone',
                callId: 'call-standalone',
                authorityTier: 'conditional_commit',
                status: 'committed',
                actions: [
                  {
                    actionId: 'a1',
                    index: 0,
                    action: 'update',
                    path: 'src/from-commit-receipt.ts',
                    status: 'committed',
                    beforeHash: 'before',
                    afterHash: 'after',
                  },
                ],
                finalHashes: {
                  'src/from-commit-receipt.ts': 'after',
                },
              },
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      expect((result.value as any).input.output.changedFiles).toEqual([
        'src/from-commit-receipt.ts',
      ])
      expect((result.value as any).input.output.status).toBe('completed')
    })

    test('works with empty initial message history', () => {
      const mockAgentState = createMockAgentState([])
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const result = generator.next({
        agentState: createMockAgentState([
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'First response' }],
          },
        ]),
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as {
        input: { output: { messages: any[] } }
      }
      expect(toolCall.input.output.messages).toHaveLength(1)
    })

    test('reports target file progress when one target remains unchanged', () => {
      const mockAgentState = createMockAgentState([])
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
        prompt: [
          'Implement the requested change.',
          '',
          'Target files:',
          '- agents/base2/base2.ts',
          '- agents/__tests__/base2.test.ts',
        ].join('\n'),
      } as any)

      expect(generator.next().value).toEqual({
        toolName: 'read_files',
        input: {
          paths: ['agents/base2/base2.ts', 'agents/__tests__/base2.test.ts'],
        },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: undefined,
          stepsComplete: false,
        }).value,
      ).toBe('STEP')

      const result = generator.next({
        agentState: createMockAgentState([
          {
            role: 'tool',
            toolName: 'str_replace',
            content: [
              {
                type: 'json',
                value: withCommittedReceipt({
                  kind: 'file_mutation_result',
                  version: 1,
                  operationId: 'editor-progress',
                  outcome: 'applied',
                  authorityTier: 'portable_path',
                  actions: [
                    {
                      actionId: 'edit',
                      index: 0,
                      action: 'update',
                      path: 'agents/base2/base2.ts',
                      outcome: 'applied',
                      beforeHash: 'before',
                      afterHash: 'after',
                    },
                  ],
                  errors: [],
                  freshCapabilities: [],
                }),
              },
            ],
          },
        ]),
        toolResult: undefined,
        stepsComplete: true,
      })

      expect((result.value as any).input.output.changedFiles).toEqual([
        'agents/base2/base2.ts',
      ])
      expect((result.value as any).input.output.targetFileProgress).toEqual({
        targetFiles: [
          'agents/base2/base2.ts',
          'agents/__tests__/base2.test.ts',
        ],
        changedTargetFiles: ['agents/base2/base2.ts'],
        pendingTargetFiles: ['agents/__tests__/base2.test.ts'],
      })
    })

    test('pre-reads targets from Markdown heading briefs without colons', () => {
      const mockAgentState = createMockAgentState([])
      const generator = editor.handleSteps!({
        agentState: mockAgentState,
        logger: { debug() {}, info() {}, warn() {}, error() {} } as any,
        params: {},
        prompt: [
          '## Requirements',
          '- Implement the change.',
          '## Target files',
          '- server/src/db/elastic.ts',
          '- server/src/db/elastic.test.ts',
          '## Constraints/non-goals',
          '- Preserve the existing API.',
        ].join('\n'),
      } as any)

      expect(generator.next().value).toEqual({
        toolName: 'read_files',
        input: {
          paths: ['server/src/db/elastic.ts', 'server/src/db/elastic.test.ts'],
        },
      })
    })
  })

  describe('style notes in instructions', () => {
    test('mentions try/catch blocks', () => {
      expect(editor.instructionsPrompt).toContain('try/catch')
    })

    test('uses language-idiomatic argument conventions', () => {
      expect(editor.instructionsPrompt).toContain(
        'defaults, optionals, builders, or overloads',
      )
    })

    test('mentions new components in new files', () => {
      expect(editor.instructionsPrompt).toContain('new file')
    })
  })
})
