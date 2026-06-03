import { describe, test, expect } from 'bun:test'

import editor, { createCodeEditor } from '../editor/editor'
import { createBestOfNImplementor } from '../editor/best-of-n/editor-implementor'
import { createMultiPromptEditor } from '../editor/best-of-n/editor-multi-prompt'
import { createBestOfNSelector2 } from '../editor/best-of-n/best-of-n-selector2'
import proposalImplementor1 from '../editor/best-of-n/editor-implementor-proposal-1'
import proposalImplementorDirect from '../editor/best-of-n/editor-implementor-proposal-direct'

import type { AgentState, ToolCall } from '../types/agent-definition'

describe('editor agent', () => {
  const PROPOSAL_TOOL_NAMES = new Set([
    'propose_str_replace',
    'propose_write_file',
    'propose_edit_transaction',
  ])

  const createMockAgentState = (messageHistory: any[] = []): AgentState => ({
    agentId: 'editor-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory,
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
    // Programmatic implementors receive the runtime-recorded proposal ledger in
    // PublicAgentState. Unit tests that simulate proposal tool messages must
    // provide the same deterministic source of truth instead of relying on the
    // implementor to reconstruct artifacts from message history.
    proposalLedger: deriveProposalLedgerFromMessages(messageHistory),
  } as AgentState)

  function deriveProposalLedgerFromMessages(messageHistory: any[]): any[] {
    let currentAttemptCalls: Array<{ toolName: string; input: any }> = []
    let currentAttemptResults: any[] = []

    for (const message of messageHistory) {
      if (Array.isArray(message?.tags) && message.tags.includes('PROPOSAL_RETRY')) {
        currentAttemptCalls = []
        currentAttemptResults = []
        continue
      }

      if (message?.role === 'assistant') {
        for (const part of Array.isArray(message.content) ? message.content : []) {
          if (
            part?.type === 'tool-call' &&
            typeof part.toolName === 'string' &&
            PROPOSAL_TOOL_NAMES.has(part.toolName)
          ) {
            currentAttemptCalls.push({
              toolName: part.toolName,
              input: part.input,
            })
          }
        }
      }

      if (
        message?.role === 'tool' &&
        typeof message.toolName === 'string' &&
        PROPOSAL_TOOL_NAMES.has(message.toolName)
      ) {
        for (const part of Array.isArray(message.content) ? message.content : []) {
          if (part?.type !== 'json') continue
          const values = Array.isArray(part.value) ? part.value : [part.value]
          for (const value of values) {
            if (value && typeof value === 'object') {
              currentAttemptResults.push(value)
            }
          }
        }
      }
    }

    return currentAttemptResults.map((result, index) => {
      const call = currentAttemptCalls[index] ?? currentAttemptCalls.at(-1) ?? {
        toolName: 'propose_write_file',
        input: { path: result.file },
      }
      return {
        seq: index,
        attempt: 0,
        toolName: call.toolName,
        input: call.input,
        result: {
          file: result.file ?? call.input?.path ?? '',
          ok:
            typeof result.unifiedDiff === 'string' &&
            result.unifiedDiff.trim().length > 0 &&
            !result.errorMessage,
          ...(typeof result.unifiedDiff === 'string'
            ? { unifiedDiff: result.unifiedDiff }
            : {}),
          ...(typeof result.message === 'string' ? { message: result.message } : {}),
          ...(typeof result.errorMessage === 'string'
            ? { errorMessage: result.errorMessage }
            : {}),
        },
      }
    })
  }

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

    test('includes message history', () => {
      expect(editor.includeMessageHistory).toBe(true)
    })

    test('inherits parent system prompt', () => {
      expect(editor.inheritParentSystemPrompt).toBe(true)
    })

    test('has correct tool names', () => {
      expect(editor.toolNames).toContain('read_files')
      expect(editor.toolNames).toContain('write_file')
      expect(editor.toolNames).toContain('str_replace')
      expect(editor.toolNames).toContain('set_output')
      expect(editor.toolNames).toHaveLength(4)
    })
  })

  describe('createCodeEditor', () => {
    test('creates opus editor by default', () => {
      const opusEditor = createCodeEditor({ model: 'opus' })
      expect(opusEditor.model).toBe('anthropic/claude-opus-4.7')
    })

    test('creates gpt-5 editor', () => {
      const gpt5Editor = createCodeEditor({ model: 'gpt-5' })
      expect(gpt5Editor.model).toBe('openai/gpt-5.5')
    })

    test('creates glm editor', () => {
      const glmEditor = createCodeEditor({ model: 'glm' })
      expect(glmEditor.model).toBe('z-ai/glm-5.1')
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

    test('gpt-5 editor does not include think tags in instructions', () => {
      const gpt5Editor = createCodeEditor({ model: 'gpt-5' })
      expect(gpt5Editor.instructionsPrompt).not.toContain('<think>')
      expect(gpt5Editor.instructionsPrompt).not.toContain('</think>')
    })

    test('glm editor does not include think tags in instructions', () => {
      const glmEditor = createCodeEditor({ model: 'glm' })
      expect(glmEditor.instructionsPrompt).not.toContain('<think>')
      expect(glmEditor.instructionsPrompt).not.toContain('</think>')
    })

    test('kimi editor does not include think tags in instructions', () => {
      const kimiEditor = createCodeEditor({ model: 'kimi' })
      expect(kimiEditor.instructionsPrompt).not.toContain('<think>')
      expect(kimiEditor.instructionsPrompt).not.toContain('</think>')
    })

    test('deepseek editor does not include think tags in instructions', () => {
      const deepseekEditor = createCodeEditor({ model: 'deepseek' })
      expect(deepseekEditor.instructionsPrompt).not.toContain('<think>')
      expect(deepseekEditor.instructionsPrompt).not.toContain('</think>')
    })

    test('minimax editor does not include think tags in instructions', () => {
      const minimaxEditor = createCodeEditor({ model: 'minimax' })
      expect(minimaxEditor.instructionsPrompt).not.toContain('<think>')
      expect(minimaxEditor.instructionsPrompt).not.toContain('</think>')
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

      // All should have same basic structure
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
      expect(editor.instructionsPrompt).toContain('old')
      expect(editor.instructionsPrompt).toContain('new')
    })

    test('contains write_file format example', () => {
      expect(editor.instructionsPrompt).toContain('write_file')
      expect(editor.instructionsPrompt).toContain('content')
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

    test('mentions not to specify input prompt', () => {
      expect(editor.spawnerPrompt).toContain('input prompt')
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

      const result = generator.next()

      expect(result.value).toBe('STEP')
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

      // First STEP
      generator.next()

      // Simulate new messages being added
      const newMessages = [
        ...initialMessages,
        { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
      ]
      const updatedState = createMockAgentState(newMessages)

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

      const newMessages = [
        ...initialMessages,
        { role: 'user', content: [{ type: 'text', text: 'Message 2' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Response 2' }] },
        { role: 'user', content: [{ type: 'text', text: 'Message 3' }] },
      ]
      const updatedState = createMockAgentState(newMessages)

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      // Should only include the 3 new messages
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

      // Verify it's a valid generator function string
      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      // Should be able to create a new function from it
      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')
    })

    test('outputs correct structure for set_output', () => {
      const initialMessages: any[] = []
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

      const newMessages = [
        { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
      ]
      const updatedState = createMockAgentState(newMessages)

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      expect(result.value).toEqual({
        toolName: 'set_output',
        input: {
          output: {
            messages: [
              { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
            ],
          },
        },
        includeToolCall: false,
      })
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

      const newMessages = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'First response' }],
        },
      ]
      const updatedState = createMockAgentState(newMessages)

      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as {
        input: { output: { messages: any[] } }
      }
      expect(toolCall.input.output.messages).toHaveLength(1)
    })
  })

  describe('style notes in instructions', () => {
    test('mentions try/catch blocks', () => {
      expect(editor.instructionsPrompt).toContain('try/catch')
    })

    test('mentions optional arguments', () => {
      expect(editor.instructionsPrompt).toContain('Optional arguments')
    })

    test('mentions new components in new files', () => {
      expect(editor.instructionsPrompt).toContain('new file')
    })
  })

  describe('best-of-N implementor', () => {
    test('isolates proposal implementors while allowing read-only context gathering', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })

      expect(implementor.includeMessageHistory).toBe(false)
      expect(implementor.inheritParentSystemPrompt).toBe(false)
      expect(implementor.systemPrompt).toContain('read_files')
      expect(implementor.systemPrompt).toContain('Never call write_file')
      expect(implementor.toolNames).toEqual([
        'read_files',
        'read_proposal_workspace',
        'code_search',
        'glob',
        'list_directory',
        'propose_write_file',
        'propose_str_replace',
        'propose_edit_transaction',
      ])
    })

    test('built-in best-of-N proposal agents have bounded read-only context tools', () => {
      expect(proposalImplementor1.includeMessageHistory).toBe(false)
      expect(proposalImplementor1.inheritParentSystemPrompt).toBe(false)
      expect(proposalImplementor1.systemPrompt).toContain(
        'You may use read_files',
      )
      expect(proposalImplementor1.toolNames).toEqual([
        'read_files',
        'read_proposal_workspace',
        'code_search',
        'glob',
        'list_directory',
        'propose_write_file',
        'propose_str_replace',
        'propose_edit_transaction',
      ])
    })

    test('direct retry proposal agent cannot use read-only tools', () => {
      expect(proposalImplementorDirect.includeMessageHistory).toBe(false)
      expect(proposalImplementorDirect.inheritParentSystemPrompt).toBe(false)
      expect(proposalImplementorDirect.systemPrompt).toContain(
        'do not have repository exploration tools',
      )
      expect(proposalImplementorDirect.toolNames).toEqual([
        'propose_write_file',
        'propose_str_replace',
        'propose_edit_transaction',
      ])
    })

    test('proposal-only handleSteps can run after sandbox serialization', () => {
      const implementor = createBestOfNImplementor({
        model: 'gpt-5',
        allowReadOnlyTools: false,
      })
      const isolatedHandleSteps = new Function(
        `return (${implementor.handleSteps!.toString()})`,
      )() as NonNullable<typeof implementor.handleSteps>
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = isolatedHandleSteps({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')

      const result = generator.next({
        agentState: createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'I can do that.' }],
          },
        ]),
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_messages',
        includeToolCall: false,
      })
      expect(
        (result.value as any).input.messages.at(-1).content[0].text,
      ).toContain('Do not try to gather more context')
    })

    test('stops after propose tool results instead of waiting for a no-tool final turn', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true },
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: {
                file: 'src/example.ts',
                unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
              },
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_output',
        input: {
          toolCalls: [
            {
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
          ],
          toolResults: [
            {
              file: 'src/example.ts',
              unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
            },
          ],
          unifiedDiffs: '--- src/example.ts ---\n@@ -1 +1 @@\n-old\n+new',
          proposalBudget: {
            maxProposalSteps: 10,
            maxReadOnlyOnlySteps: 3,
            complexity: 'standard',
            hasPrefetchedContext: false,
          },
        },
        includeToolCall: false,
      })
    })

    test('bundle mode continues after a successful proposal to collect additional file edits', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true, proposalBundleMode: true },
      })

      expect(generator.next().value).toBe('STEP')

      const firstProposalMessages = [
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/a.ts',
                replacements: [{ oldString: 'oldA', newString: 'newA' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            },
          ],
        },
      ]

      expect(
        generator.next({
          agentState: createMockAgentState(firstProposalMessages),
          toolResult: [],
          stepsComplete: true,
        }).value,
      ).toBe('STEP')

      const secondProposalMessages = [
        ...firstProposalMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: 'src/b.ts',
                instructions: 'Add B',
                content: 'export const b = 2\n',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_write_file',
          content: [
            {
              type: 'json',
              value: { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
            },
          ],
        },
      ]

      expect(
        generator.next({
          agentState: createMockAgentState(secondProposalMessages),
          toolResult: [],
          stepsComplete: false,
        }).value,
      ).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...secondProposalMessages,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Done.' }],
          },
        ]),
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          toolCalls: [
            {
              toolName: 'propose_str_replace',
              input: {
                path: 'src/a.ts',
                replacements: [{ oldString: 'oldA', newString: 'newA' }],
              },
            },
            {
              toolName: 'propose_write_file',
              input: {
                path: 'src/b.ts',
                instructions: 'Add B',
                content: 'export const b = 2\n',
              },
            },
          ],
          toolResults: [
            { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
          ],
          unifiedDiffs:
            '--- src/a.ts ---\n@@ diff A\n\n--- src/b.ts ---\n@@ diff B',
          stopReason: 'cleanProposal',
        },
        includeToolCall: false,
      })
    })

    test('bundle mode treats a provider-complete multi-file bundle as clean without marker', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true, proposalBundleMode: true },
      })

      expect(generator.next().value).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'propose_write_file',
                input: {
                  path: 'src/a.ts',
                  instructions: 'Add A',
                  content: 'export const a = 1\n',
                },
              },
              {
                type: 'tool-call',
                toolName: 'propose_write_file',
                input: {
                  path: 'src/b.ts',
                  instructions: 'Add B',
                  content: 'export const b = 2\n',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolName: 'propose_write_file',
            content: [
              {
                type: 'json',
                value: [
                  { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                  { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                ],
              },
            ],
          },
        ]),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'cleanProposal',
          toolResults: [
            { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
          ],
        },
        includeToolCall: false,
      })
    })

    test('bundle mode treats explicit completion marker as a clean proposal', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true, proposalBundleMode: true },
      })

      expect(generator.next().value).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'propose_write_file',
                input: {
                  path: 'src/a.ts',
                  instructions: 'Add A',
                  content: 'export const a = 1\n',
                },
              },
              { type: 'text', text: 'PROPOSAL_BUNDLE_COMPLETE' },
            ],
          },
          {
            role: 'tool',
            toolName: 'propose_write_file',
            content: [
              {
                type: 'json',
                value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
              },
            ],
          },
        ]),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'cleanProposal',
          unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
        },
        includeToolCall: false,
      })
    })

    test('bundle mode keeps one-file output partial when task context expects multiple files and no marker', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          allowReadOnlyTools: true,
          proposalBundleMode: true,
          proposalContext:
            'Implement changes across src/a.ts and src/b.ts for this multi-file task.',
        },
      })

      expect(generator.next().value).toBe('STEP')

      const firstProposalMessages = [
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: 'src/a.ts',
                instructions: 'Add A',
                content: 'export const a = 1\n',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_write_file',
          content: [
            {
              type: 'json',
              value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            },
          ],
        },
      ]

      expect(
        generator.next({
          agentState: createMockAgentState(firstProposalMessages),
          toolResult: [],
          stepsComplete: true,
        }).value,
      ).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...firstProposalMessages,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Done.' }],
          },
        ]),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'noCompletionSignal',
          toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
          proposalBudget: {
            expectedTouchedFileCount: 2,
            expectsMultipleFiles: true,
          },
        },
        includeToolCall: false,
      })
    })

    test('bundle mode honors explicit expected file count when task text does not expose paths', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          allowReadOnlyTools: true,
          proposalBundleMode: true,
          proposalContext: 'Apply the requested smoke edits.',
          expectedTouchedFileCount: 2,
          expectsMultipleFiles: true,
        },
      })

      expect(generator.next().value).toBe('STEP')

      const firstProposalMessages = [
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: '.codebuff-smoke/multi-a.txt',
                instructions: 'Update A',
                content: 'alpha: after\n',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_write_file',
          content: [
            {
              type: 'json',
              value: {
                file: '.codebuff-smoke/multi-a.txt',
                unifiedDiff: '@@ diff A',
              },
            },
          ],
        },
      ]

      expect(
        generator.next({
          agentState: createMockAgentState(firstProposalMessages),
          toolResult: [],
          stepsComplete: true,
        }).value,
      ).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...firstProposalMessages,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Done.' }],
          },
        ]),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'noCompletionSignal',
          toolResults: [
            {
              file: '.codebuff-smoke/multi-a.txt',
              unifiedDiff: '@@ diff A',
            },
          ],
          proposalBudget: {
            expectedTouchedFileCount: 2,
            expectsMultipleFiles: true,
          },
        },
        includeToolCall: false,
      })
      expect((output.input as any).proposalBudget.evidence).toContain(
        'paramFileCount:2',
      )
    })

    test('bundle mode preserves proposal calls when completion marker arrives in a later step', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true, proposalBundleMode: true },
      })

      expect(generator.next().value).toBe('STEP')

      const firstProposalMessages = [
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: 'src/a.ts',
                instructions: 'Add A',
                content: 'export const a = 1\n',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_write_file',
          content: [
            {
              type: 'json',
              value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            },
          ],
        },
      ]

      expect(
        generator.next({
          agentState: createMockAgentState(firstProposalMessages),
          toolResult: [],
          stepsComplete: false,
        }).value,
      ).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...firstProposalMessages,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'PROPOSAL_BUNDLE_COMPLETE' }],
          },
        ]),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'cleanProposal',
          toolCalls: [
            {
              toolName: 'propose_write_file',
              input: {
                path: 'src/a.ts',
                instructions: 'Add A',
                content: 'export const a = 1\n',
              },
            },
          ],
          toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
          unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
        },
        includeToolCall: false,
      })
    })

    test('bundle mode does not leak stale proposal calls across retry boundaries', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true, proposalBundleMode: true },
      })

      expect(generator.next().value).toBe('STEP')

      const failedAttemptMessages = [
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/a.ts',
                replacements: [{ oldString: 'stale', newString: 'new' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: {
                file: 'src/a.ts',
                errorMessage: 'old string "stale" was not found',
              },
            },
          ],
        },
      ]

      const retry = generator.next({
        agentState: createMockAgentState(failedAttemptMessages),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_messages'>

      expect(retry.toolName).toBe('set_messages')

      const retryMessages = retry.input.messages
      const correctedAttemptMessages = [
        ...retryMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/a.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
            { type: 'text', text: 'PROPOSAL_BUNDLE_COMPLETE' },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            },
          ],
        },
      ]

      expect(generator.next().value).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState(correctedAttemptMessages),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'cleanProposal',
          toolCalls: [
            {
              toolName: 'propose_str_replace',
              input: {
                path: 'src/a.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
          ],
          toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
        },
        includeToolCall: false,
      })
      expect((output.input as any).toolCalls).toHaveLength(1)
    })

    test('bundle mode stops immediately when known multi-file scope is covered', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          allowReadOnlyTools: true,
          proposalBundleMode: true,
          proposalContext:
            'Implement the requested changes in src/a.ts and src/b.ts.',
        },
      })

      expect(generator.next().value).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'propose_write_file',
                input: {
                  path: 'src/a.ts',
                  instructions: 'Add A',
                  content: 'export const a = 1\n',
                },
              },
              {
                type: 'tool-call',
                toolName: 'propose_write_file',
                input: {
                  path: 'src/b.ts',
                  instructions: 'Add B',
                  content: 'export const b = 2\n',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolName: 'propose_write_file',
            content: [
              {
                type: 'json',
                value: [
                  { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                  { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                ],
              },
            ],
          },
        ]),
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'cleanProposal',
          proposalBudget: {
            expectedTouchedFileCount: 2,
            expectsMultipleFiles: true,
          },
          toolResults: [
            { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
          ],
        },
        includeToolCall: false,
      })
    })

    test('bundle mode keeps large known scopes partial until coverage or marker', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          allowReadOnlyTools: true,
          proposalBundleMode: true,
          proposalContext:
            'Update src/a.ts, src/b.ts, src/c.ts, src/d.ts, src/e.ts, and src/f.ts for this coordinated change.',
        },
      })

      expect(generator.next().value).toBe('STEP')

      const partialProposalMessages = [
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: 'src/a.ts',
                instructions: 'Add A',
                content: 'export const a = 1\n',
              },
            },
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: 'src/b.ts',
                instructions: 'Add B',
                content: 'export const b = 2\n',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_write_file',
          content: [
            {
              type: 'json',
              value: [
                { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
              ],
            },
          ],
        },
      ]

      expect(
        generator.next({
          agentState: createMockAgentState(partialProposalMessages),
          toolResult: [],
          stepsComplete: false,
        }).value,
      ).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...partialProposalMessages,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Done.' }],
          },
        ]),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'noCompletionSignal',
          proposalBudget: {
            expectedTouchedFileCount: 6,
            expectsMultipleFiles: true,
          },
          toolResults: [
            { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
          ],
        },
        includeToolCall: false,
      })
    })

    test('bundle mode stops after the configured proposal-bearing turn cap', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          allowReadOnlyTools: true,
          proposalBundleMode: true,
          maxBundleProposalTurns: 2,
        },
      })

      expect(generator.next().value).toBe('STEP')

      const firstProposalMessages = [
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: 'src/a.ts',
                instructions: 'Add A',
                content: 'export const a = 1\n',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_write_file',
          content: [
            {
              type: 'json',
              value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            },
          ],
        },
      ]

      expect(
        generator.next({
          agentState: createMockAgentState(firstProposalMessages),
          toolResult: [],
          stepsComplete: true,
        }).value,
      ).toBe('STEP')

      const secondProposalMessages = [
        ...firstProposalMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_write_file',
              input: {
                path: 'src/b.ts',
                instructions: 'Add B',
                content: 'export const b = 2\n',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_write_file',
          content: [
            {
              type: 'json',
              value: { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
            },
          ],
        },
      ]

      const output = generator.next({
        agentState: createMockAgentState(secondProposalMessages),
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'cleanProposal',
          toolResults: [
            { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
          ],
          unifiedDiffs:
            '--- src/a.ts ---\n@@ diff A\n\n--- src/b.ts ---\n@@ diff B',
          proposalBudget: {
            maxBundleProposalTurns: 2,
          },
        },
        includeToolCall: false,
      })
    })

    test('bundle mode ignores duplicate no-op proposal failures after successful diffs', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Update src/a.ts and src/b.ts' }],
        },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          allowReadOnlyTools: true,
          proposalBundleMode: true,
          proposalContext: 'Update src/a.ts and src/b.ts.',
        },
      })

      expect(generator.next().value).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'propose_str_replace',
                input: {
                  path: 'src/a.ts',
                  replacements: [{ oldString: 'oldA', newString: 'newA' }],
                },
              },
              {
                type: 'tool-call',
                toolName: 'propose_str_replace',
                input: {
                  path: 'src/a.ts',
                  replacements: [{ oldString: 'oldA', newString: 'newA' }],
                },
              },
              {
                type: 'tool-call',
                toolName: 'propose_str_replace',
                input: {
                  path: 'src/b.ts',
                  replacements: [{ oldString: 'oldB', newString: 'newB' }],
                },
              },
            ],
          },
          {
            role: 'tool',
            toolName: 'propose_str_replace',
            content: [
              {
                type: 'json',
                value: [
                  { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                  { file: 'src/a.ts', message: 'No change to the file' },
                  { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                ],
              },
            ],
          },
        ]),
        toolResult: [],
        stepsComplete: true,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'cleanProposal',
          toolResults: [
            { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
          ],
          unifiedDiffs:
            '--- src/a.ts ---\n@@ diff A\n\n--- src/b.ts ---\n@@ diff B',
        },
        includeToolCall: false,
      })
    })

    test('bundle mode preserves successful diffs when a later proposal edit fails', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Add reasoning effort config' }],
        },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          allowReadOnlyTools: false,
          proposalBundleMode: true,
          proposalContext:
            'Create cli/src/types/reasoning-effort.ts and update related routes if present.',
        },
      })

      expect(generator.next().value).toBe('STEP')

      const output = generator.next({
        agentState: createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'propose_str_replace',
                input: {
                  path: 'cli/src/types/model-route.ts',
                  replacements: [
                    { oldString: 'export type ModelRoute', newString: 'x' },
                  ],
                },
              },
              {
                type: 'tool-call',
                toolName: 'propose_write_file',
                input: {
                  path: 'cli/src/types/reasoning-effort.ts',
                  instructions: 'Add shared reasoning effort types',
                  content:
                    "export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'\n",
                },
              },
            ],
          },
          {
            role: 'tool',
            toolName: 'propose_str_replace',
            content: [
              {
                type: 'json',
                value: [
                  {
                    file: 'cli/src/types/model-route.ts',
                    errorMessage:
                      'The file does not exist, skipping. Please use the write_file tool to create the file.',
                  },
                  {
                    file: 'cli/src/types/reasoning-effort.ts',
                    unifiedDiff:
                      '--- /dev/null\n+++ cli/src/types/reasoning-effort.ts\n@@\n+export type ReasoningEffort = ...',
                  },
                ],
              },
            ],
          },
        ]),
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'noCompletionSignal',
          toolCalls: [
            {
              toolName: 'propose_write_file',
              input: { path: 'cli/src/types/reasoning-effort.ts' },
            },
          ],
          toolResults: [
            {
              file: 'cli/src/types/model-route.ts',
              errorMessage:
                'The file does not exist, skipping. Please use the write_file tool to create the file.',
            },
            {
              file: 'cli/src/types/reasoning-effort.ts',
              unifiedDiff:
                '--- /dev/null\n+++ cli/src/types/reasoning-effort.ts\n@@\n+export type ReasoningEffort = ...',
            },
          ],
          proposalProgress: {
            failedProposalResultCount: 1,
            successfulProposalResultCount: 1,
          },
        },
        includeToolCall: false,
      })
      expect((output.input as any).errorMessage).toBeUndefined()
      expect(
        (output.input as any).toolCalls.some(
          (toolCall: any) =>
            toolCall.input?.path === 'cli/src/types/model-route.ts',
        ),
      ).toBe(false)
    })

    test('uses adaptive proposal step budgets from task complexity and prefetched context', () => {
      const getBudgetForParams = (params: Record<string, any>) => {
        const implementor = createBestOfNImplementor({ model: 'gpt-5' })
        const initialMessages = [
          { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
        ]
        const mockAgentState = createMockAgentState(initialMessages)
        const generator = implementor.handleSteps!({
          agentState: mockAgentState,
          logger: {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
          } as any,
          params: { ...params, allowReadOnlyTools: true },
        })

        expect(generator.next().value).toBe('STEP')

        const updatedState = createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'propose_str_replace',
                input: {
                  path: 'src/example.ts',
                  replacements: [{ oldString: 'old', newString: 'new' }],
                },
              },
              { type: 'text', text: 'PROPOSAL_BUNDLE_COMPLETE' },
            ],
          },
          {
            role: 'tool',
            toolName: 'propose_str_replace',
            content: [
              {
                type: 'json',
                value: {
                  file: 'src/example.ts',
                  unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
                },
              },
            ],
          },
        ])

        const result = generator.next({
          agentState: updatedState,
          toolResult: [],
          stepsComplete: false,
        })

        return (result.value as any).input.proposalBudget
      }

      expect(
        getBudgetForParams({
          proposalStrategy: 'In src/example.ts, replace beta=2 with beta=20.',
          proposalContext: 'User requests:\n- Make the minimal exact change.',
        }),
      ).toMatchObject({
        maxProposalSteps: 6,
        maxReadOnlyOnlySteps: 3,
        complexity: 'simple',
        hasPrefetchedContext: false,
      })

      expect(
        getBudgetForParams({
          proposalStrategy:
            'Implement Phase 3 full-screen provider picker: create cli/src/components/provider-picker-screen.tsx, wire cli/src/chat.tsx, update cli/src/commands/command-registry.ts, add tests.',
          proposalContext:
            'User requests:\n- Run the prompt itself, it is what I want to test',
        }),
      ).toMatchObject({
        maxProposalSteps: 14,
        complexity: 'complex',
        hasPrefetchedContext: false,
      })

      expect(
        getBudgetForParams({
          proposalStrategy:
            'Implement Phase 3 full-screen provider picker: create cli/src/components/provider-picker-screen.tsx, wire cli/src/chat.tsx, update cli/src/commands/command-registry.ts, add tests.',
          proposalContext:
            'Current file/search context already gathered by the parent agent:\nFile: docs/openbuff-provider-model-setup-ux.md\nPhase 3 details...',
        }),
      ).toMatchObject({
        maxProposalSteps: 10,
        complexity: 'complex',
        hasPrefetchedContext: true,
      })

      expect(
        getBudgetForParams({
          proposalStrategy:
            'Update src/a.ts, src/b.ts, src/c.ts, src/d.ts, and src/e.ts for a coordinated feature.',
          proposalContext:
            'Current file/search context already gathered by the parent agent:\nFile: src/a.ts\nFile: src/b.ts\nFile: src/c.ts\nFile: src/d.ts\nFile: src/e.ts',
          proposalBundleMode: true,
        }),
      ).toMatchObject({
        maxProposalSteps: 12,
        maxBundleProposalTurns: 8,
        expectedTouchedFileCount: 5,
        complexity: 'complex',
      })

      expect(
        getBudgetForParams({
          proposalStrategy:
            'Implement the coordinated workflow across more than 5 files.',
          proposalContext:
            'User requests:\n- This task can touch more than 5files if needed.',
          proposalBundleMode: true,
        }),
      ).toMatchObject({
        expectedTouchedFileCount: 6,
        expectsMultipleFiles: true,
        complexity: 'complex',
      })
    })

    test('adds a direct retry reminder when a proposal step only thinks/narrates', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true },
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [{ type: 'text', text: '<think>Still thinking...</think>' }],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_messages',
        includeToolCall: false,
      })
      expect(
        (result.value as any).input.messages.at(-1).content[0].text,
      ).toContain(
        'emit every required file edit as valid XML proposal tool calls',
      )
    })

    test('retries when a proposal step ends without a propose tool result', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true },
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I can make that change.' }],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: true,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_messages',
        includeToolCall: false,
      })
      const retryText = (result.value as any).input.messages.at(-1).content[0]
        .text
      expect(retryText).toContain('<codebuff_tool_call>')
      expect(retryText).toContain('propose_str_replace')
      expect(retryText).toContain('propose_write_file')
    })

    test('retries failed proposal tool results instead of treating them as usable output', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true },
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [{ oldString: 'stale', newString: 'new' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: {
                file: 'src/example.ts',
                errorMessage:
                  'The old string "stale" was not found. No change to the file',
              },
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_messages',
        includeToolCall: false,
      })
      const retryText = (result.value as any).input.messages.at(-1).content[0]
        .text
      expect(retryText).toContain('old string "stale" was not found')
      expect(retryText).toContain('read_files')
      expect(retryText).toContain('Do not call write_file')
      expect(retryText).toContain('propose_write_file')
    })

    test('salvages partially failed proposal results that also contain a unified diff', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const generator = implementor.handleSteps!({
        agentState: createMockAgentState(initialMessages),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true },
      })

      expect(generator.next().value).toBe('STEP')

      const result = generator.next({
        agentState: createMockAgentState([
          ...initialMessages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'propose_str_replace',
                input: {
                  path: 'src/example.ts',
                  replacements: [
                    { oldString: 'stale', newString: 'new' },
                    { oldString: 'old', newString: 'newer' },
                  ],
                },
              },
            ],
          },
          {
            role: 'tool',
            toolName: 'propose_str_replace',
            content: [
              {
                type: 'json',
                value: {
                  file: 'src/example.ts',
                  message:
                    'The old string "stale" was not found in the file, skipping.\n\nApplied another replacement.',
                  unifiedDiff: '@@ -1 +1 @@\n-old\n+newer',
                },
              },
            ],
          },
        ]),
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_output',
        input: {
          toolCalls: [
            {
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [
                  { oldString: 'stale', newString: 'new' },
                  { oldString: 'old', newString: 'newer' },
                ],
              },
            },
          ],
          toolResults: [
            {
              file: 'src/example.ts',
              message:
                'The old string "stale" was not found in the file, skipping.\n\nApplied another replacement.',
              unifiedDiff: '@@ -1 +1 @@\n-old\n+newer',
            },
          ],
          stopReason: 'cleanProposal',
        },
        includeToolCall: false,
      })
    })

    test('continues normally after read-only context gathering', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { allowReadOnlyTools: true },
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'read_files',
              input: { paths: ['src/example.ts'] },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'read_files',
          content: [
            {
              type: 'json',
              value: [{ path: 'src/example.ts', content: 'const old = 1' }],
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toBe('STEP')
    })

    test('captures mixed success and failure proposal results as partial output', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/a.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/b.ts',
                replacements: [{ oldString: 'stale', newString: 'new' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: [
                { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                {
                  file: 'src/b.ts',
                  errorMessage: 'The old string "stale" was not found',
                },
              ],
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_output',
        input: {
          stopReason: 'noCompletionSignal',
          toolCalls: [
            {
              toolName: 'propose_str_replace',
              input: { path: 'src/a.ts' },
            },
          ],
          toolResults: [
            { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            {
              file: 'src/b.ts',
              errorMessage: 'The old string "stale" was not found',
            },
          ],
          proposalProgress: {
            failedProposalResultCount: 1,
          },
        },
        includeToolCall: false,
      })
      expect(
        (result.value as any).input.toolCalls.some(
          (toolCall: any) => toolCall.input?.path === 'src/b.ts',
        ),
      ).toBe(false)
    })
  })

  describe('multi-prompt editor', () => {
    test('uses isolated selector context instead of inherited parent history', () => {
      const selector = createBestOfNSelector2({ model: 'gpt-5' })

      expect(selector.includeMessageHistory).toBe(false)
      expect(selector.inheritParentSystemPrompt).toBe(false)
      expect(
        selector.inputSchema?.params?.properties?.requestContext,
      ).toBeDefined()
      expect(selector.instructionsPrompt).toContain('params.requestContext')
    })

    test('spawns proposals sequentially and retries unusable proposal output once', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
        {
          role: 'tool',
          toolName: 'read_files',
          content: [
            {
              type: 'json',
              value: [{ path: 'src/a.ts', content: 'const oldValue = 1' }],
            },
          ],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal', 'modular'] },
      })

      // First trim the inherited prompt messages.
      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      const firstSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>
      expect(firstSpawn.input.agents).toHaveLength(1)
      expect(firstSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-direct',
      )
      expect(firstSpawn.input.agents[0].prompt).toBe('Strategy: minimal')
      expect(firstSpawn.input.agents[0].prompt).not.toContain('<user>')
      expect(firstSpawn.input.agents[0].params?.proposalContext).toContain(
        'Original task',
      )
      expect(firstSpawn.input.agents[0].params?.proposalContext).not.toContain(
        '<user>',
      )
      expect(firstSpawn.input.agents[0].params?.proposalContext).toContain(
        'File: src/a.ts',
      )
      expect(firstSpawn.input.agents[0].params?.proposalContext).not.toContain(
        '<tool',
      )
      expect(firstSpawn.input.agents[0].params?.proposalRequirements).toContain(
        'Do not call read_files',
      )
      expect(firstSpawn.input.agents[0].params?.proposalRequirements).toContain(
        'write_file',
      )
      expect(firstSpawn.input.agents[0].params?.proposalRequirements).toContain(
        'PROPOSAL_BUNDLE_COMPLETE',
      )
      expect(firstSpawn.input.agents[0].params?.allowReadOnlyTools).toBe(false)
      expect(firstSpawn.input.agents[0].params?.proposalBundleMode).toBe(true)
      expect(firstSpawn.input.agents[0].params?.proposalLabel).toBe(
        'Proposal #1',
      )
      expect(firstSpawn.input.agents[0].params?.proposalPhase).toBe('initial')
      expect(
        firstSpawn.input.agents[0].params?.proposalOrchestrationPlan,
      ).toMatchObject({
        mode: expect.any(String),
        riskControls: expect.arrayContaining(['parent-prefetch']),
      })
      expect(
        firstSpawn.input.agents[0].params?.maxBundleProposalTurns,
      ).toBeUndefined()

      const retrySpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'provider stalled' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>
      expect(retrySpawn.input.agents).toHaveLength(1)
      expect(retrySpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )
      expect(retrySpawn.input.agents[0].prompt).toContain('Retry Strategy')
      expect(retrySpawn.input.agents[0].params?.previousFailure).toContain(
        'provider stalled',
      )

      const secondProposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(secondProposalSpawn.input.agents).toHaveLength(1)
      expect(secondProposalSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-direct',
      )
    })

    test('preserves parent read_files context even when file contents mention proposal tools', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Update the tool list' }],
        },
        {
          role: 'tool',
          toolName: 'read_files',
          content: [
            {
              type: 'json',
              value: [
                {
                  path: 'common/src/tools/list.ts',
                  content:
                    "export const toolNames = ['read_files', 'propose_write_file']\n",
                },
              ],
            },
          ],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['Update the tool list'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      const proposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(proposalSpawn.input.agents[0].params?.proposalContext).toContain(
        'File: common/src/tools/list.ts',
      )
      expect(proposalSpawn.input.agents[0].params?.proposalContext).toContain(
        'propose_write_file',
      )
    })

    test('continues read-only retries when exploration produces no exact file context', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-1' }],
        },
      })

      const readOnlyRetry = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [],
                  toolResults: [],
                  unifiedDiffs: '',
                  stopReason: 'noProposal',
                  errorMessage:
                    'Gathered context with code_search, but did not emit propose_str_replace/propose_write_file before the proposal step budget.',
                  readOnlyContext:
                    'Read-only context gathered by previous proposal attempt:\n\ncode_search result: packages/agent-runtime/src/tools/handlers/tool/read-docs.ts mentions const current = true\n',
                  proposalProgress: {
                    stepsTaken: 4,
                    readOnlyToolCallCount: 3,
                    proposalToolCallCount: 0,
                  },
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(readOnlyRetry.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )
      expect(readOnlyRetry.input.agents[0].params?.allowReadOnlyTools).toBe(true)
      expect(
        readOnlyRetry.input.agents[0].params?.proposalRequirements,
      ).toContain('you may use read_files')
      expect(readOnlyRetry.input.agents[0].params?.previousFailure).toContain(
        'did not emit propose_str_replace/propose_write_file',
      )
      expect(readOnlyRetry.input.agents[0].params?.proposalContext).toContain(
        'packages/agent-runtime/src/tools/handlers/tool/read-docs.ts',
      )
      expect(readOnlyRetry.input.agents[0].params?.proposalContext).toContain(
        'const current = true',
      )

      const secondDirectRetry = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_write_file',
                      input: {
                        path: 'src/a.ts',
                        content: 'export const a = 1\n',
                      },
                    },
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/missing.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [
                    { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    {
                      file: 'src/missing.ts',
                      errorMessage: 'The file does not exist, skipping.',
                    },
                  ],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(secondDirectRetry.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )
      expect(secondDirectRetry.input.agents[0].params?.allowReadOnlyTools).toBe(
        true,
      )
    })

    test('uses direct proposal mode when explicit file prefetch supplies exact content', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Run the prompt itself' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          prompts: ['Implement docs/openbuff-provider-model-setup-ux.md'],
        },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      const readDocsCall = generator.next({
        agentState: mockAgentState,
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(readDocsCall).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['docs/openbuff-provider-model-setup-ux.md'] },
        includeToolCall: false,
      })

      const proposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                path: 'docs/openbuff-provider-model-setup-ux.md',
                content: 'Phase 3 details from the proposal doc',
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(proposalSpawn.toolName).toBe('spawn_agents')
      expect(proposalSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-direct',
      )
      expect(proposalSpawn.input.agents[0].params?.allowReadOnlyTools).toBe(
        false,
      )
      expect(proposalSpawn.input.agents[0].params?.proposalContext).toContain(
        'File: docs/openbuff-provider-model-setup-ux.md',
      )
      expect(proposalSpawn.input.agents[0].params?.proposalContext).toContain(
        'Phase 3 details from the proposal doc',
      )
    })

    test('prefetches snake_case task identifiers such as read_docs', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Run the prompt itself' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          prompts: ['Fix read_docs Context7 fallback'],
        },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      const searchCall = generator.next({
        agentState: mockAgentState,
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'code_search'>

      expect(searchCall).toMatchObject({
        toolName: 'code_search',
        input: expect.objectContaining({ pattern: 'read_docs' }),
        includeToolCall: false,
      })
    })

    test('resolves bare file names with glob before spawning proposals', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Fix editor-multi-prompt.ts retry behavior',
            },
          ],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          prompts: ['Make the direct proposal retry reliable'],
        },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      const globCall = generator.next({
        agentState: mockAgentState,
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'glob'>

      expect(globCall).toMatchObject({
        toolName: 'glob',
        input: { pattern: '**/editor-multi-prompt.ts' },
        includeToolCall: false,
      })

      const readCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              files: ['agents/editor/best-of-n/editor-multi-prompt.ts'],
              count: 1,
              message: 'Found 1 file',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(readCall).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['agents/editor/best-of-n/editor-multi-prompt.ts'] },
        includeToolCall: false,
      })

      const maybeSearchOrProposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                path: 'agents/editor/best-of-n/editor-multi-prompt.ts',
                content: 'export function createMultiPromptEditor() {}',
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'code_search'> | ToolCall<'spawn_agents'>

      const proposalSpawn =
        maybeSearchOrProposalSpawn.toolName === 'code_search'
          ? (generator.next({
              agentState: mockAgentState,
              toolResult: [],
              stepsComplete: false,
            }).value as ToolCall<'spawn_agents'>)
          : maybeSearchOrProposalSpawn

      expect(proposalSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-direct',
      )
      expect(proposalSpawn.input.agents[0].params?.proposalContext).toContain(
        'File: agents/editor/best-of-n/editor-multi-prompt.ts',
      )
    })

    test('does not treat raw glob results as proposal target file hints', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Implement cli/src/components/model-route-picker.tsx only',
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'glob',
          content: [
            {
              type: 'json',
              value: {
                files: [
                  'cli/src/utils/__tests__/fingerprint.test.ts',
                  'cli/src/utils/__tests__/run-state-storage.test.ts',
                  'cli/src/utils/__tests__/format-timeout.test.ts',
                ],
              },
            },
          ],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          prompts: ['Add the reasoning step'],
        },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'read_files'>,
      ).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['cli/src/components/model-route-picker.tsx'] },
      })

      const proposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                path: 'cli/src/components/model-route-picker.tsx',
                content: 'export const value = 1',
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      const plan =
        proposalSpawn.input.agents[0].params?.proposalOrchestrationPlan
      expect(plan?.targetFileHints).toContain(
        'cli/src/components/model-route-picker.tsx',
      )
      expect(plan?.targetFileHints).not.toContain(
        'cli/src/utils/__tests__/fingerprint.test.ts',
      )
      expect(plan?.targetFileHints).not.toContain(
        'cli/src/utils/__tests__/run-state-storage.test.ts',
      )
      expect(
        proposalSpawn.input.agents[0].params?.proposalRequirements,
      ).not.toContain('cli/src/utils/__tests__/fingerprint.test.ts')
    })

    test('prefetches file paths discovered inside referenced docs before spawning proposals', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Implement the referenced doc' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {
          prompts: ['Implement docs/openbuff-provider-model-setup-ux.md'],
        },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'read_files'>,
      ).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['docs/openbuff-provider-model-setup-ux.md'] },
      })

      const targetPrefetch = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                path: 'docs/openbuff-provider-model-setup-ux.md',
                content:
                  'Implementation targets: cli/src/provider/picker.tsx and cli/src/provider/route.ts',
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(targetPrefetch).toMatchObject({
        toolName: 'read_files',
        input: {
          paths: ['cli/src/provider/picker.tsx', 'cli/src/provider/route.ts'],
        },
        includeToolCall: false,
      })
    })

    test('unwraps actual spawn_agents proposal reports before retry decisions', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal', 'modular'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const nextProposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                agentName: 'Implementation Generator',
                agentType: 'editor-implementor-proposal-1',
                value: {
                  type: 'structuredOutput',
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(nextProposalSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-2',
      )
    })

    test('retries proposal output that omits toolResults without crashing', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        toolName: 'spawn_agents',
      })

      const retrySpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [],
                  unifiedDiffs: 'no changes',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(retrySpawn.input.agents[0].prompt).toBe('Retry Strategy: minimal')
      expect(retrySpawn.input.agents[0].params?.previousFailure).toContain(
        'No ledger-generated proposal diffs were produced.',
      )
    })

    test('applies the first usable proposal when selector fails', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        toolName: 'spawn_agents',
      })

      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(selectorSpawn.input.agents[0].agent_type).toBe(
        'best-of-n-selector2',
      )
      expect(selectorSpawn.input.agents[0].params?.requestContext).toContain(
        'Original task',
      )
      expect(selectorSpawn.input.agents[0].params?.requestContext).toContain(
        'minimal',
      )

      // First selector attempt fails
      const selectorRetry = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector quota reached' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      // Selector retries once before falling back
      expect(selectorRetry.input.agents[0].agent_type).toBe(
        'best-of-n-selector2',
      )

      // Second selector attempt also fails
      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              { value: { errorMessage: 'selector quota reached again' } },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [{ oldString: 'old', newString: 'new' }],
        },
      })

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'src/a.ts', message: 'updated' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).reason).toContain('Selector failed')
      expect((outputCall.input as any).chosenStrategy).toBe('minimal')
    })

    test('accepts synthesized empty-client str_replace result when it includes patch evidence', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [{ oldString: 'old', newString: 'new' }],
                        },
                      },
                    ],
                    toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector quota reached' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector quota reached again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({ toolName: 'str_replace' })

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'src/a.ts',
              unifiedDiff: '@@ diff A',
              patch: '@@ diff A',
              message:
                'Applied str_replace patch; synthesized result because the client returned an empty response.',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall).toMatchObject({
        toolName: 'set_output',
      })
      expect((outputCall.input as any).error).toBeUndefined()
      expect((outputCall.input as any).toolResults).toEqual([
        {
          file: 'src/a.ts',
          unifiedDiff: '@@ diff A',
          patch: '@@ diff A',
          message:
            'Applied str_replace patch; synthesized result because the client returned an empty response.',
        },
      ])
    })

    test('treats synthesized empty-client str_replace result without patch evidence as failure-like', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'stale', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector quota reached' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector quota reached again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({ toolName: 'str_replace' })

      const repairRead = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'src/a.ts',
              message:
                'The old string "stale" was not found. No change to the file',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(repairRead).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['src/a.ts'] },
      })
    })

    test('objective pipeline verifies proposals in an isolated workspace before applying', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'], forceObjectiveVerification: true },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-1' }],
        },
      })

      const listRoot = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'agents/editor/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [
                    { file: 'agents/editor/a.ts', unifiedDiff: '@@ diff A' },
                  ],
                  unifiedDiffs: '--- agents/editor/a.ts ---\n@@ diff A',
                  stopReason: 'cleanProposal',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'list_directory'>

      expect(listRoot).toMatchObject({
        toolName: 'list_directory',
        input: { path: '.' },
      })

      const readPackageJson = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              entries: [
                { name: 'package.json' },
                { name: 'bun.lockb' },
                { name: 'tsconfig.json' },
              ],
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(readPackageJson).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['package.json'] },
      })

      const validateRead = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                path: 'package.json',
                content: JSON.stringify({
                  scripts: {
                    typecheck: 'tsc --noEmit',
                    test: 'bun test',
                  },
                  workspaces: ['agents'],
                }),
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(validateRead).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['agents/package.json'] },
      })

      const packageScopedValidationRead = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                path: 'agents/package.json',
                content: JSON.stringify({
                  scripts: {
                    typecheck: 'bun x tsc --noEmit -p tsconfig.json',
                    test: 'bun test __tests__',
                  },
                }),
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(packageScopedValidationRead).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['agents/editor/a.ts'] },
      })

      const isolatedVerify = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ path: 'agents/editor/a.ts', content: 'old' }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'run_terminal_command'>

      const commandPayload = isolatedVerify.input.command
        .trim()
        .split(/\s+/)
        .at(-1)
      const verificationCommands = JSON.parse(
        Buffer.from(commandPayload!, 'base64').toString('utf8'),
      )

      expect(isolatedVerify.toolName).toBe('run_terminal_command')
      expect(isolatedVerify.input.command).toContain('codebuff-verify')
      expect(isolatedVerify.input.command).not.toContain('git checkout')
      expect(isolatedVerify.input.command).not.toContain('git clean')
      expect(verificationCommands).toEqual([
        {
          kind: 'typecheck',
          label: 'Typecheck (agents)',
          command: "bun --cwd 'agents' run typecheck",
        },
        {
          kind: 'test',
          label: 'Tests (agents)',
          command: "bun --cwd 'agents' run test",
        },
      ])

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              exitCode: 0,
              stdout: `${JSON.stringify({
                outputs: [
                  {
                    kind: 'typecheck',
                    label: 'Typecheck',
                    command: "bun --cwd 'agents' run typecheck",
                    exitCode: 0,
                    stdout: '',
                    stderr: '',
                  },
                  {
                    kind: 'test',
                    label: 'Tests',
                    command: "bun --cwd 'agents' run test",
                    exitCode: 0,
                    stdout: '',
                    stderr: '',
                  },
                ],
              })}\n`,
              stderr: '',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'agents/editor/a.ts',
          replacements: [{ oldString: 'old', newString: 'new' }],
        },
      })

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'agents/editor/a.ts', unifiedDiff: '@@ applied' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).reason).toContain(
        'verificationAttempted=true',
      )
      expect((outputCall.input as any).reason).toContain(
        'verificationPassed=true',
      )
    })

    test('objective pipeline does not mark verification as passed when no verifier is found', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'], forceObjectiveVerification: true },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'editor-implementor-proposal-1' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_write_file',
                        input: {
                          path: 'src/new.ts',
                          content: 'export const value = 1\n',
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/new.ts', unifiedDiff: '@@ diff new' },
                    ],
                    unifiedDiffs: '--- src/new.ts ---\n@@ diff new',
                    stopReason: 'cleanProposal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'list_directory'>,
      ).toMatchObject({
        toolName: 'list_directory',
        input: { path: '.' },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { entries: [{ name: 'README.md' }] },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'write_file'>

      expect(applyCall).toMatchObject({
        toolName: 'write_file',
        input: {
          path: 'src/new.ts',
          content: 'export const value = 1\n',
        },
      })

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'src/new.ts', message: 'Wrote file' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).reason).toContain(
        'verificationAttempted=false',
      )
      expect((outputCall.input as any).reason).toContain(
        'verificationPassed=false',
      )
    })

    test('objective dry-run validation simulates sequential replacements and whitespace fallback in one file', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'], forceObjectiveVerification: true },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'editor-implementor-proposal-1' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            {
                              oldString: 'const old = 1',
                              newString: 'const mid=1',
                            },
                            {
                              oldString: 'const mid = 1',
                              newString: 'const done = 1',
                            },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    stopReason: 'cleanProposal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'list_directory'>,
      ).toMatchObject({
        toolName: 'list_directory',
        input: { path: '.' },
      })

      const validationRead = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { entries: [{ name: 'README.md' }] },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(validationRead).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['src/a.ts'] },
        includeToolCall: false,
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ path: 'src/a.ts', content: 'const old = 1' }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [
            { oldString: 'const old = 1', newString: 'const mid=1' },
            { oldString: 'const mid = 1', newString: 'const done = 1' },
          ],
        },
      })
    })

    test('selector fallback applies the highest-ranked clean proposal, not the first proposal', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['small edit', 'broader edit'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'editor-implementor-proposal-1' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'oldA', newString: 'newA' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    stopReason: 'cleanProposal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-2' }],
        },
      })

      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/b.ts',
                        replacements: [
                          { oldString: 'oldB', newString: 'newB' },
                        ],
                      },
                    },
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/c.ts',
                        replacements: [
                          { oldString: 'oldC', newString: 'newC' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                    { file: 'src/c.ts', unifiedDiff: '@@ diff C' },
                  ],
                  unifiedDiffs:
                    '--- src/b.ts ---\n@@ diff B\n\n--- src/c.ts ---\n@@ diff C',
                  stopReason: 'cleanProposal',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(
        selectorSpawn.input.agents[0].params?.implementations.map(
          (implementation: any) => implementation.id,
        ),
      ).toEqual(['candidate-1', 'candidate-2'])
      expect(
        selectorSpawn.input.agents[0].params?.implementations.map(
          (implementation: any) => implementation.strategy,
        ),
      ).toEqual(expect.arrayContaining(['small edit', 'broader edit']))
      expect(
        selectorSpawn.input.agents[0].params?.implementations[0].id,
      ).not.toBe('B')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector failed again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/b.ts',
          replacements: [{ oldString: 'oldB', newString: 'newB' }],
        },
      })
    })

    test('selector sees captured partial proposals when clean proposals exist', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['partial edit', 'clean edit'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'editor-implementor-proposal-1' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'oldA', newString: 'newA' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    stopReason: 'noCompletionSignal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-2' }],
        },
      })

      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/b.ts',
                        replacements: [
                          { oldString: 'oldB', newString: 'newB' },
                        ],
                      },
                    },
                  ],
                  toolResults: [{ file: 'src/b.ts', unifiedDiff: '@@ diff B' }],
                  unifiedDiffs: '--- src/b.ts ---\n@@ diff B',
                  stopReason: 'cleanProposal',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(
        selectorSpawn.input.agents[0].params?.implementations.map(
          (implementation: any) => implementation.strategy,
        ),
      ).toEqual(expect.arrayContaining(['partial edit', 'clean edit']))
      expect(
        selectorSpawn.input.agents[0].params?.implementations.find(
          (implementation: any) => implementation.strategy === 'partial edit',
        )?.content,
      ).toContain('captured-but-unconfirmed')
    })

    test('selector can apply a higher-coverage captured bundle over a clean narrow proposal', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Update codebuff-web-api.ts, read-docs.ts, and codebuff-web-api.test.ts.',
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'read_files',
          content: [
            {
              type: 'json',
              value: [
                {
                  path: 'packages/agent-runtime/src/llm-api/codebuff-web-api.ts',
                  content: 'export const api = 1\n',
                },
                {
                  path: 'packages/agent-runtime/src/tools/handlers/tool/read-docs.ts',
                  content: 'export const docs = 1\n',
                },
                {
                  path: 'packages/agent-runtime/src/__tests__/codebuff-web-api.test.ts',
                  content: 'test("api", () => {})\n',
                },
              ],
            },
          ],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['clean narrow', 'captured broad'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-direct' }],
        },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_write_file',
                        input: {
                          path: 'packages/agent-runtime/src/__tests__/codebuff-web-api.test.ts',
                          content:
                            'test("api", () => expect(true).toBe(true))\n',
                        },
                      },
                    ],
                    toolResults: [
                      {
                        file: 'packages/agent-runtime/src/__tests__/codebuff-web-api.test.ts',
                        unifiedDiff: '@@ test diff',
                      },
                    ],
                    unifiedDiffs:
                      '--- packages/agent-runtime/src/__tests__/codebuff-web-api.test.ts ---\n@@ test diff',
                    stopReason: 'cleanProposal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-direct' }],
        },
      })

      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_write_file',
                      input: {
                        path: 'agent-runtime/src/llm-api/codebuff-web-api.ts',
                        content: 'export const api = 2\n',
                      },
                    },
                    {
                      toolName: 'propose_write_file',
                      input: {
                        path: 'agent-runtime/src/tools/handlers/tool/read-docs.ts',
                        content: 'export const docs = 2\n',
                      },
                    },
                    {
                      toolName: 'propose_write_file',
                      input: {
                        path: 'agent-runtime/src/__tests__/codebuff-web-api.test.ts',
                        content: 'test("api", () => expect(true).toBe(true))\n',
                      },
                    },
                  ],
                  toolResults: [
                    {
                      file: 'agent-runtime/src/llm-api/codebuff-web-api.ts',
                      unifiedDiff: '@@ api diff',
                    },
                    {
                      file: 'agent-runtime/src/tools/handlers/tool/read-docs.ts',
                      unifiedDiff: '@@ docs diff',
                    },
                    {
                      file: 'agent-runtime/src/__tests__/codebuff-web-api.test.ts',
                      unifiedDiff: '@@ test diff',
                    },
                  ],
                  unifiedDiffs:
                    '--- agent-runtime/src/llm-api/codebuff-web-api.ts ---\n@@ api diff\n\n--- agent-runtime/src/tools/handlers/tool/read-docs.ts ---\n@@ docs diff\n\n--- agent-runtime/src/__tests__/codebuff-web-api.test.ts ---\n@@ test diff',
                  stopReason: 'noCompletionSignal',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      const broadCandidate =
        selectorSpawn.input.agents[0].params?.implementations.find(
          (implementation: any) => implementation.strategy === 'captured broad',
        )
      expect(broadCandidate).toBeTruthy()
      expect(broadCandidate?.content).toContain('captured-but-unconfirmed')

      const firstApply = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: broadCandidate!.id,
                  reason: 'The captured bundle covers all requested files.',
                  suggestedImprovements:
                    'Diagnostic: clean narrow proposal missed production files.',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'write_file'>

      expect(firstApply).toMatchObject({
        toolName: 'write_file',
        input: {
          path: 'packages/agent-runtime/src/llm-api/codebuff-web-api.ts',
        },
      })

      const secondApply = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'packages/agent-runtime/src/llm-api/codebuff-web-api.ts',
              message: 'Wrote file',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'write_file'>

      expect(secondApply.input.path).toBe(
        'packages/agent-runtime/src/tools/handlers/tool/read-docs.ts',
      )

      const thirdApply = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'packages/agent-runtime/src/tools/handlers/tool/read-docs.ts',
              message: 'Wrote file',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'write_file'>

      expect(thirdApply.input.path).toBe(
        'packages/agent-runtime/src/__tests__/codebuff-web-api.test.ts',
      )

      const output = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'packages/agent-runtime/src/__tests__/codebuff-web-api.test.ts',
              message: 'Wrote file',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(output.input).toMatchObject({
        selectedProposalId: 'B',
        selectedProposalLabel: 'Proposal #2',
        appliedProposalId: 'B',
        appliedProposalLabel: 'Proposal #2',
        suggestedImprovements: '',
        proposalSummary: {
          selectorNotes:
            'Diagnostic only; do not start another proposal/fix loop from this note: Diagnostic: clean narrow proposal missed production files.',
        },
      })
    })

    test('applies successful proposal despite duplicate no-op edit result', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['duplicate noop'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-1' }],
        },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                      { file: 'src/a.ts', message: 'No change to the file' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    stopReason: 'cleanProposal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const firstApply = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector failed again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(firstApply).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [{ oldString: 'old', newString: 'new' }],
        },
      })

      const duplicateApply = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'src/a.ts', message: 'updated' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(duplicateApply.toolName).toBe('str_replace')

      const output = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'src/a.ts', message: 'No change to the file' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          chosenStrategy: 'duplicate noop',
          toolResults: [{ file: 'src/a.ts', message: 'updated' }],
        },
      })
    })

    test('rejects diff-only proposals because there are no edits to apply', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Update a file' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        toolName: 'spawn_agents',
      })

      const diffOnlyResult = {
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                value: {
                  toolCalls: [],
                  toolResults: [],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  stopReason: 'cleanProposal',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }

      for (let retryIndex = 0; retryIndex < 2; retryIndex++) {
        const retrySpawn = generator.next(diffOnlyResult).value as ToolCall<'spawn_agents'>
        expect(retrySpawn).toMatchObject({
          toolName: 'spawn_agents',
          input: {
            agents: [{ prompt: expect.stringContaining('Retry Strategy') }],
          },
        })
      }

      const output = generator.next(diffOnlyResult).value as ToolCall<'set_output'>

      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          error: expect.stringContaining(
            'No proposal returned ledger-generated edit diffs',
          ),
        },
      })
    })

    test('completes a partial proposal before applying it', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Update two related files' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['multi-file'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        toolName: 'spawn_agents',
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'oldA', newString: 'newA' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    stopReason: 'noCompletionSignal',
                    proposalBudget: {
                      maxProposalSteps: 10,
                      maxReadOnlyOnlySteps: 3,
                      maxBundleProposalTurns: 5,
                      expectedTouchedFileCount: 2,
                      complexity: 'complex',
                      hasPrefetchedContext: true,
                      evidence: ['filePaths:2'],
                    },
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      // Make selector fail both attempts so fallback uses the partial proposal.
      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const completionRead = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector failed again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(completionRead).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['src/a.ts'] },
        includeToolCall: false,
      })

      const completionSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ path: 'src/a.ts', content: 'oldA' }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(completionSpawn.input.agents[0].prompt).toBe(
        'Complete Proposal #1',
      )
      expect(completionSpawn.input.agents[0].params?.proposalLabel).toBe(
        'Complete Proposal #1',
      )
      expect(completionSpawn.input.agents[0].params?.proposalPhase).toBe(
        'completion',
      )
      expect(completionSpawn.input.agents[0].params?.proposalContext).toContain(
        'Partial stop reason: noCompletionSignal',
      )
      expect(
        completionSpawn.input.agents[0].params?.proposalRequirements,
      ).toContain('PROPOSAL_BUNDLE_COMPLETE')

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [
                          { oldString: 'oldA', newString: 'newA' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    { file: 'src/a.ts', unifiedDiff: '@@ complete A' },
                  ],
                  unifiedDiffs: '--- src/a.ts ---\n@@ complete A',
                  stopReason: 'cleanProposal',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [{ oldString: 'oldA', newString: 'newA' }],
        },
      })
    })

    test('reports failure when an applied proposal misses an explicitly required file', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Update two related files' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['multi-file'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'oldA', newString: 'newA' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    stopReason: 'noCompletionSignal',
                    proposalBudget: {
                      maxProposalSteps: 10,
                      maxReadOnlyOnlySteps: 3,
                      maxBundleProposalTurns: 5,
                      expectedTouchedFileCount: 2,
                      hasExplicitExpectedTouchedFileCount: true,
                      complexity: 'complex',
                      hasPrefetchedContext: true,
                      evidence: ['filePaths:2'],
                    },
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed again' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'read_files'>,
      ).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['src/a.ts'] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ path: 'src/a.ts', content: 'oldA' }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-1' }],
        },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [],
                  toolResults: [],
                  unifiedDiffs: '',
                  errorMessage: 'completion model failed',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [{ oldString: 'oldA', newString: 'newA' }],
        },
      })

      const output = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      // Incomplete multi-file coverage must be reported as a hard failure, not
      // a partial success with only a diagnostic note. Applying 1 of 2 required
      // files used to be reported as success, which hallucinated completion.
      const errorOutput = output.input as { error?: string }
      expect(typeof errorOutput.error).toBe('string')
      expect(errorOutput.error).toContain(
        'Failed to fully apply the chosen implementation',
      )
      expect(errorOutput.error).toContain(
        'Coverage warning: applied 1 of 2 expected file(s). Planned files: src/a.ts.',
      )
      expect(output.input).not.toHaveProperty('chosenStrategy')
    })

    test('applies a captured partial proposal directly when it already covers the expected file set', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Update two related files' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['multi-file'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'oldA', newString: 'newA' },
                          ],
                        },
                      },
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/b.ts',
                          replacements: [
                            { oldString: 'oldB', newString: 'newB' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                      { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                    ],
                    unifiedDiffs:
                      '--- src/a.ts ---\n@@ diff A\n\n--- src/b.ts ---\n@@ diff B',
                    stopReason: 'noCompletionSignal',
                    proposalBudget: {
                      maxProposalSteps: 10,
                      maxReadOnlyOnlySteps: 3,
                      maxBundleProposalTurns: 5,
                      expectedTouchedFileCount: 2,
                      complexity: 'complex',
                      hasPrefetchedContext: true,
                      evidence: ['filePaths:2'],
                    },
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector failed again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [{ oldString: 'oldA', newString: 'newA' }],
        },
      })
    })

    test('excludes unusable proposals before selecting between valid proposals', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['no-op', 'safe edit', 'modular edit'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      const firstProposal = generator.next({
        agentState: mockAgentState,
        toolResult: [],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>
      expect(firstProposal.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )

      const directRetry = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  type: 'error',
                  message: 'Subagent editor-implementor-proposal-1 timed out',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>
      expect(directRetry.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )

      const finalRetry = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [],
                  toolResults: [],
                  unifiedDiffs: '',
                  stopReason: 'noProposal',
                  errorMessage:
                    'No propose_str_replace/propose_write_file call was produced.',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>
      expect(finalRetry.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )

      const secondProposal = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [],
                  toolResults: [],
                  unifiedDiffs: '',
                  stopReason: 'noProposal',
                  errorMessage:
                    'No propose_str_replace/propose_write_file call was produced.',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>
      expect(secondProposal.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-2',
      )

      const thirdProposal = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/b.ts',
                        replacements: [
                          { oldString: 'oldB', newString: 'newB' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                  ],
                  unifiedDiffs: '--- src/b.ts ---\n@@ diff B',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>
      expect(thirdProposal.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-3',
      )

      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/c.ts',
                        replacements: [
                          { oldString: 'oldC', newString: 'newC' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    { file: 'src/c.ts', unifiedDiff: '@@ diff C' },
                  ],
                  unifiedDiffs: '--- src/c.ts ---\n@@ diff C',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(selectorSpawn.input.agents[0].agent_type).toBe(
        'best-of-n-selector2',
      )
      expect(
        selectorSpawn.input.agents[0].params?.implementations.map(
          (implementation: any) => implementation.id,
        ),
      ).toEqual(['candidate-1', 'candidate-2'])
      expect(
        selectorSpawn.input.agents[0].params?.implementations.map(
          (implementation: any) => implementation.strategy,
        ),
      ).toEqual(expect.arrayContaining(['safe edit', 'modular edit']))
      const modularCandidate =
        selectorSpawn.input.agents[0].params?.implementations.find(
          (implementation: any) => implementation.strategy === 'modular edit',
        )
      expect(modularCandidate?.id).toMatch(/^candidate-/)

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: modularCandidate!.id,
                  reason: 'C is more complete.',
                  suggestedImprovements: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/c.ts',
          replacements: [{ oldString: 'oldC', newString: 'newC' }],
        },
      })
    })

    test('rejects unanchored foreign-language proposal paths when TypeScript context is supplied', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
        {
          role: 'tool',
          toolName: 'read_files',
          content: [
            {
              type: 'json',
              value: [
                {
                  path: 'packages/agent-runtime/src/tools/read-docs.ts',
                  content: 'export const existing = true\n',
                },
              ],
            },
          ],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['Fix docs fallback'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: {
          agents: [{ agent_type: 'editor-implementor-proposal-direct' }],
        },
      })

      const retry = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_write_file',
                      input: {
                        path: 'src/integrations/context7_api.py',
                        content: 'def wrong_language(): pass\n',
                      },
                    },
                  ],
                  toolResults: [
                    {
                      file: 'src/integrations/context7_api.py',
                      unifiedDiff: '@@ python diff',
                    },
                  ],
                  unifiedDiffs:
                    '--- src/integrations/context7_api.py ---\n@@ python diff',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(retry.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )
      expect(retry.input.agents[0].agent_type).not.toBe('best-of-n-selector2')
    })

    test('reports proposal summaries when no proposal has edits', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      for (let attempt = 0; attempt < 3; attempt++) {
        const spawnCall = generator.next({
          agentState: mockAgentState,
          toolResult:
            attempt === 0
              ? []
              : [
                  {
                    type: 'json',
                    value: [
                      {
                        value: {
                          toolCalls: [],
                          toolResults: [],
                          unifiedDiffs: '',
                          errorMessage: 'No changes proposed',
                        },
                      },
                    ],
                  },
                ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>

        expect(spawnCall.toolName).toBe('spawn_agents')
        expect(spawnCall.input.agents[0].agent_type).toBe(
          'editor-implementor-proposal-1',
        )
      }

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [],
                  toolResults: [],
                  unifiedDiffs: '',
                  errorMessage: 'No changes proposed',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).error).toContain(
        'No proposal returned ledger-generated edit diffs',
      )
      expect((outputCall.input as any).error).toContain('A (minimal):')
      expect((outputCall.input as any).error).not.toContain(
        'Failed to find chosen implementation: none',
      )
    })

    test('unwraps actual spawn_agents selector reports before retry decisions', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  agentName: 'Implementation Generator',
                  agentType: 'editor-implementor-proposal-1',
                  value: {
                    type: 'structuredOutput',
                    value: {
                      toolCalls: [
                        {
                          toolName: 'propose_str_replace',
                          input: {
                            path: 'src/a.ts',
                            replacements: [
                              { oldString: 'old', newString: 'new' },
                            ],
                          },
                        },
                      ],
                      toolResults: [
                        { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                      ],
                      unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    },
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                agentName: 'Best-of-N GPT-5 Diff Selector',
                agentType: 'best-of-n-selector2',
                value: {
                  type: 'structuredOutput',
                  value: {
                    implementationId: 'A',
                    reason: 'Only implementation',
                    suggestedImprovements: '',
                  },
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall.toolName).toBe('str_replace')
      expect(applyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'old', newString: 'new' }],
      })
    })

    test('does not report success when final apply returns no recorded tool result', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'Only implementation',
                  suggestedImprovements: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall.toolName).toBe('str_replace')

      const readFilesCall = generator.next({
        agentState: mockAgentState,
        toolResult: undefined,
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(readFilesCall.toolName).toBe('read_files')
      expect(readFilesCall.input).toMatchObject({ paths: ['src/a.ts'] })

      const repairSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ path: 'src/a.ts', content: 'old' }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(repairSpawn.toolName).toBe('spawn_agents')
      expect(repairSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )
      expect(
        repairSpawn.input.agents[0].params?.previousFailure,
      ).toContain('did not return a tool result; no edit was recorded')
    })

    test('applies selected proposal directly even when selector asks for synthesis', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'A is solid',
                  suggestedImprovements:
                    'SYNTHESIZE: Also preserve the export order.',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall.toolName).toBe('str_replace')
      expect(applyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'old', newString: 'new' }],
      })
    })

    test('applies selected proposal directly for optional selector polish', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'A is solid',
                  suggestedImprovements:
                    'Borrow only clearer optional wording from candidate-2.',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall.toolName).toBe('str_replace')
      expect(applyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'old', newString: 'new' }],
      })
    })

    test('ignores selector synthesis directives instead of rerunning proposals', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['selected', 'fallback'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'editor-implementor-proposal-1' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'oldA', newString: 'newA' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    stopReason: 'cleanProposal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'editor-implementor-proposal-2' }] },
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/b.ts',
                          replacements: [
                            { oldString: 'oldB', newString: 'newB' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                    ],
                    unifiedDiffs: '--- src/b.ts ---\n@@ diff B',
                    stopReason: 'cleanProposal',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'A is better',
                  suggestedImprovements:
                    'SYNTHESIZE: Also preserve the export order.',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [{ oldString: 'oldA', newString: 'newA' }],
        },
      })
    })

    test('falls back to another usable proposal when the selected edit fails to apply', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['selected', 'fallback'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        toolName: 'spawn_agents',
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'stale', newString: 'bad' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        toolName: 'spawn_agents',
      })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff B' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff B',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        toolName: 'spawn_agents',
      })

      const selectedApplyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'A looked best',
                  suggestedImprovements: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(selectedApplyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'stale', newString: 'bad' }],
      })

      const repairReadCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'src/a.ts',
              errorMessage: 'The old string "stale" was not found',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(repairReadCall).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['src/a.ts'] },
        includeToolCall: false,
      })

      const repairSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ path: 'src/a.ts', content: 'const old = 1' }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(repairSpawn.toolName).toBe('spawn_agents')
      expect(repairSpawn.input.agents[0].prompt).toBe('Repair Proposal #1')
      expect(repairSpawn.input.agents[0].params?.proposalLabel).toBe(
        'Repair Proposal #1',
      )
      expect(repairSpawn.input.agents[0].params?.proposalPhase).toBe('repair')
      expect(repairSpawn.input.agents[0].params?.proposalContext).toContain(
        'old string "stale"',
      )
      expect(repairSpawn.input.agents[0].params?.proposalContext).toContain(
        'Fresh current file context after apply failure',
      )

      const fallbackApplyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'repair failed' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(fallbackApplyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'old', newString: 'new' }],
      })

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'src/a.ts', message: 'updated' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).chosenStrategy).toBe('fallback')
      expect((outputCall.input as any).reason).toContain(
        'failed to apply cleanly',
      )
      expect((outputCall.input as any).toolResults).toEqual([
        { file: 'src/a.ts', message: 'updated' },
      ])
      expect(() =>
        (outputCall.input as any).toolResults.map(Boolean),
      ).not.toThrow()
    })

    test('repairs selected implementation against current context before falling back', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['selected'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'stale', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const selectedApplyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'A looked best',
                  suggestedImprovements: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(selectedApplyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'stale', newString: 'new' }],
      })

      const repairReadCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'src/a.ts',
              errorMessage: 'The old string "stale" was not found',
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'read_files'>

      expect(repairReadCall).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['src/a.ts'] },
        includeToolCall: false,
      })

      const repairSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ path: 'src/a.ts', content: 'const old = 1' }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(repairSpawn.input.agents[0].prompt).toBe('Repair Proposal #1')
      expect(repairSpawn.input.agents[0].params?.proposalLabel).toBe(
        'Repair Proposal #1',
      )
      expect(repairSpawn.input.agents[0].params?.proposalPhase).toBe('repair')
      expect(
        repairSpawn.input.agents[0].params?.proposalRequirements,
      ).toContain('bounded read-only tools')
      expect(repairSpawn.input.agents[0].params?.allowReadOnlyTools).toBe(true)
      expect(repairSpawn.input.agents[0].params?.proposalBundleMode).toBe(true)
      expect(
        repairSpawn.input.agents[0].params?.proposalRequirements,
      ).toContain('PROPOSAL_BUNDLE_COMPLETE')
      expect(
        repairSpawn.input.agents[0].params?.maxBundleProposalTurns,
      ).toBeUndefined()
      expect(repairSpawn.input.agents[0].params?.proposalContext).toContain(
        'Fresh current file context after apply failure',
      )

      const repairedApplyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [
                          { oldString: 'current', newString: 'new' },
                        ],
                      },
                    },
                  ],
                  toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ repair' }],
                  unifiedDiffs: '--- src/a.ts ---\n@@ repair',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(repairedApplyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'current', newString: 'new' }],
      })

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { file: 'src/a.ts', message: 'updated' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).chosenStrategy).toContain('repaired')
      expect((outputCall.input as any).reason).toContain(
        'repaired against current file context',
      )
    })

    test('flattens nested applied tool results without unwrapping domain values', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_write_file',
                        input: {
                          path: 'src/a.ts',
                          instructions: 'update file',
                          content: 'new',
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'Only implementation',
                  suggestedImprovements: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'write_file'>

      expect(applyCall.toolName).toBe('write_file')

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          [
            {
              type: 'json',
              value: { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
            },
          ],
        ] as any,
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).toolResults).toEqual([
        { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
      ])
      expect(() =>
        (outputCall.input as any).toolResults.map(Boolean),
      ).not.toThrow()
    })

    test('strips stale internal best-of-n traces before spawning proposals', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          tags: ['USER_PROMPT'],
          content: [{ type: 'text', text: 'Fix the real bug' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'spawn_agents',
              input: {
                agents: [{ agent_type: 'editor-implementor-proposal-1' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'spawn_agents',
          content: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    errorMessage: 'Selector failed to return an implementation',
                  },
                },
              ],
            },
          ],
        },
        {
          role: 'user',
          tags: ['INSTRUCTIONS_PROMPT'],
          content: [{ type: 'text', text: 'Internal instructions' }],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      const setMessages = generator.next().value as ToolCall<'set_messages'>
      const messages = (setMessages.input as any).messages

      expect(setMessages.toolName).toBe('set_messages')
      expect(JSON.stringify(messages)).toContain('Fix the real bug')
      expect(JSON.stringify(messages)).not.toContain(
        'editor-implementor-proposal-1',
      )
      expect(JSON.stringify(messages)).not.toContain('Internal instructions')
    })

    test('extractSpawnResults preserves null structured output as error sentinel', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      // First spawn
      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      // Simulate null structured output (set_output validation failed).
      // The value wrapper contains { type: 'structuredOutput', value: null }.
      const retrySpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: { type: 'structuredOutput', value: null },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      // Should retry instead of crashing — the null was converted to an error sentinel
      expect(retrySpawn.toolName).toBe('spawn_agents')
      expect(retrySpawn.input.agents[0].prompt).toContain('Retry Strategy')
    })

    test('retries aggregate diffs that are missing ledger-style toolResults', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal', 'modular'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      // Aggregate diff text alone is not a materialized proposal artifact. The
      // parent contract requires ledger-style successful toolResults so raw
      // model output cannot become a candidate without deterministic preflight.
      const retrySpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(retrySpawn.toolName).toBe('spawn_agents')
      expect(retrySpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )
      expect(retrySpawn.input.agents[0].prompt).toContain('Retry Strategy')
    })

    test('uses ledger-recovered proposal output from spawned implementor as a normal proposal', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal', 'modular'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const secondProposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                agentName: 'Implementation Proposal 1',
                agentType: 'editor-implementor-proposal-1',
                value: {
                  type: 'structuredOutput',
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    ],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    proposalBudget: { recoveredFromLedger: true },
                  },
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(secondProposalSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-2',
      )
    })

    test('applies the chosen proposal via a plain str_replace remap', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                agentName: 'Implementation Proposal 1',
                agentType: 'editor-implementor-proposal-1',
                value: {
                  type: 'structuredOutput',
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'src/a.ts',
                          replacements: [
                            {
                              oldString: 'stale anchor from proposal time',
                              newString: 'anchor replay should not be used',
                            },
                          ],
                          __proposalFile: 'src/a.ts',
                          __proposalFinalContent:
                            'fresh resolved proposal content\n',
                          __proposalBaseContent: 'current disk content\n',
                          __proposalBaseContentHash: 'unused-when-base-present',
                        },
                      },
                    ],
                    toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
                    unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                    proposalBudget: { recoveredFromLedger: true },
                  },
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(selectorSpawn.input.agents[0].agent_type).toBe(
        'best-of-n-selector2',
      )

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      // The apply phase replays the chosen proposal's propose_str_replace as a
      // real str_replace against current disk content (the upstream behavior).
      // The __proposal* metadata is stripped before applying, so the real edit
      // carries only the original path/replacements.
      const strReplaceApply = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector failed again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(strReplaceApply).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [
            {
              oldString: 'stale anchor from proposal time',
              newString: 'anchor replay should not be used',
            },
          ],
        },
      })
      expect(JSON.stringify(strReplaceApply.input)).not.toContain(
        '__proposalFinalContent',
      )
      expect(JSON.stringify(strReplaceApply.input)).not.toContain(
        '__proposalBaseContent',
      )

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: { path: 'src/a.ts', unifiedDiff: '@@ applied' },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).error).toBeUndefined()
    })

    test('retries proposal tool calls that produced no generated diffs', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      // Ledger-only contract: a structured output with bare proposal tool calls
      // but no generated diff never materialized a real diff, so it is NOT a
      // usable candidate. It must be retried rather than sent into
      // selection/repair (which is what wasted tokens and "selected best out of
      // nothing").
      const noDiffProposalResult = {
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json' as const,
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [],
                  unifiedDiffs: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }

      const retrySpawn = generator.next(
        noDiffProposalResult,
      ).value as ToolCall<'spawn_agents'>

      expect(retrySpawn.toolName).toBe('spawn_agents')
      expect(retrySpawn.input.agents[0].agent_type).not.toBe(
        'best-of-n-selector2',
      )
      expect(retrySpawn.input.agents[0].prompt).toContain('Retry Strategy')

      const secondRetrySpawn = generator.next(
        noDiffProposalResult,
      ).value as ToolCall<'spawn_agents'>
      expect(secondRetrySpawn.toolName).toBe('spawn_agents')
      expect(secondRetrySpawn.input.agents[0].agent_type).not.toBe(
        'best-of-n-selector2',
      )
      expect(secondRetrySpawn.input.agents[0].prompt).toContain(
        'Retry Strategy',
      )

      const output = generator.next(
        noDiffProposalResult,
      ).value as ToolCall<'set_output'>
      expect(output).toMatchObject({
        toolName: 'set_output',
        input: {
          error: expect.stringContaining(
            'No proposal returned ledger-generated edit diffs',
          ),
        },
      })
    })

    test('isUsableProposal retries mixed success and failure toolResults', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal', 'modular'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const retrySpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/b.ts',
                        replacements: [
                          { oldString: 'stale', newString: 'new' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                    {
                      file: 'src/b.ts',
                      errorMessage: 'The old string "stale" was not found',
                    },
                  ],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(retrySpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-1',
      )
      expect(retrySpawn.input.agents[0].prompt).toBe('Retry Strategy: minimal')
      expect(retrySpawn.input.agents[0].params?.previousFailure).toContain(
        'old string "stale"',
      )
    })

    test('isUsableProposal salvages unified diff results whose message reports a skipped replacement', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [
                          { oldString: 'stale', newString: 'bad' },
                          { oldString: 'old', newString: 'new' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    {
                      file: 'src/a.ts',
                      message:
                        'The old string "stale" was not found in the file, skipping.\n\nApplied another replacement.',
                      unifiedDiff: '@@ diff A',
                    },
                  ],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(selectorSpawn.input.agents[0].agent_type).toBe(
        'best-of-n-selector2',
      )

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [{ value: { errorMessage: 'selector failed' } }],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'selector failed again' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      expect(applyCall).toMatchObject({
        toolName: 'str_replace',
        input: {
          path: 'src/a.ts',
          replacements: [{ oldString: 'old', newString: 'new' }],
        },
      })
      expect(JSON.stringify(applyCall.input)).not.toContain('oldString":"stale')
    })

    test('selector succeeds on retry after first attempt fails', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      // First proposal spawn
      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      // Successful proposal → triggers selector
      const selectorSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
                  unifiedDiffs: '--- src/a.ts ---\n@@ diff A',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(selectorSpawn.input.agents[0].agent_type).toBe(
        'best-of-n-selector2',
      )

      // First selector attempt fails
      const selectorRetry = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [{ value: { errorMessage: 'model failed' } }],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      // Should retry selector
      expect(selectorRetry.input.agents[0].agent_type).toBe(
        'best-of-n-selector2',
      )

      // Second selector attempt succeeds
      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'Only implementation',
                  suggestedImprovements: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'str_replace'>

      // Should proceed to apply the chosen implementation
      expect(applyCall.toolName).toBe('str_replace')
      expect(applyCall.input).toMatchObject({
        path: 'src/a.ts',
        replacements: [{ oldString: 'old', newString: 'new' }],
      })
    })

    test('recognizes successful edit_transaction results as persisted per-file edits', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Update src/a.ts and src/b.ts together' },
          ],
        },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['transaction'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'read_files'>,
      ).toMatchObject({
        toolName: 'read_files',
        input: { paths: ['src/a.ts', 'src/b.ts'] },
      })

      let proposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              { path: 'src/a.ts', content: 'oldA' },
              { path: 'src/b.ts', content: 'oldB' },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'code_search'> | ToolCall<'spawn_agents'>

      while (proposalSpawn.toolName === 'code_search') {
        proposalSpawn = generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'code_search'> | ToolCall<'spawn_agents'>
      }

      expect(proposalSpawn).toMatchObject({ toolName: 'spawn_agents' })

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [
            {
              type: 'json',
              value: [
                {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_edit_transaction',
                        input: {
                          edits: [
                            {
                              id: 'a',
                              type: 'str_replace',
                              path: 'src/a.ts',
                              replacements: [
                                { oldString: 'oldA', newString: 'newA' },
                              ],
                            },
                            {
                              id: 'b',
                              type: 'str_replace',
                              path: 'src/b.ts',
                              replacements: [
                                { oldString: 'oldB', newString: 'newB' },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                      { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                    ],
                    unifiedDiffs:
                      '--- src/a.ts ---\n@@ diff A\n\n--- src/b.ts ---\n@@ diff B',
                  },
                },
              ],
            },
          ],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({
        input: { agents: [{ agent_type: 'best-of-n-selector2' }] },
      })

      const applyCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  implementationId: 'A',
                  reason: 'Transaction covers both files',
                  suggestedImprovements: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'edit_transaction'>

      expect(applyCall).toMatchObject({
        toolName: 'edit_transaction',
        input: {
          edits: [
            expect.objectContaining({ path: 'src/a.ts' }),
            expect.objectContaining({ path: 'src/b.ts' }),
          ],
        },
      })

      const outputCall = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: {
              message: 'Edit transaction applied successfully.',
              files: [
                { path: 'src/a.ts', patch: '@@ diff A' },
                { path: 'src/b.ts', patch: '@@ diff B' },
              ],
            },
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'set_output'>

      expect(outputCall.toolName).toBe('set_output')
      expect((outputCall.input as any).toolResults).toEqual([
        {
          file: 'src/a.ts',
          unifiedDiff: '@@ diff A',
          message: 'Edit transaction applied successfully.',
        },
        {
          file: 'src/b.ts',
          unifiedDiff: '@@ diff B',
          message: 'Edit transaction applied successfully.',
        },
      ])
      expect((outputCall.input as any).error).toBeUndefined()
    })

    test('implementor dedupes transaction ledger artifacts into one apply tool call', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const mockAgentState = {
        ...createMockAgentState([
          { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
        ]),
        proposalLedger: [
          {
            seq: 0,
            attempt: 0,
            toolName: 'propose_edit_transaction',
            input: {
              edits: [
                {
                  id: 'a',
                  type: 'str_replace',
                  path: 'src/a.ts',
                  replacements: [{ oldString: 'oldA', newString: 'newA' }],
                },
                {
                  id: 'b',
                  type: 'str_replace',
                  path: 'src/b.ts',
                  replacements: [{ oldString: 'oldB', newString: 'newB' }],
                },
              ],
            },
            result: {
              file: 'src/a.ts',
              ok: true,
              unifiedDiff: '@@ -1 +1 @@\n-oldA\n+newA',
              message: 'Proposed changes to src/a.ts',
            },
          },
          {
            seq: 1,
            attempt: 0,
            toolName: 'propose_edit_transaction',
            input: {
              edits: [
                {
                  id: 'a',
                  type: 'str_replace',
                  path: 'src/a.ts',
                  replacements: [{ oldString: 'oldA', newString: 'newA' }],
                },
                {
                  id: 'b',
                  type: 'str_replace',
                  path: 'src/b.ts',
                  replacements: [{ oldString: 'oldB', newString: 'newB' }],
                },
              ],
            },
            result: {
              file: 'src/b.ts',
              ok: true,
              unifiedDiff: '@@ -1 +1 @@\n-oldB\n+newB',
              message: 'Proposed changes to src/b.ts',
            },
          },
        ],
      } as AgentState
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')

      const result = generator.next({
        agentState: mockAgentState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_output',
        input: {
          unifiedDiffs:
            '--- src/a.ts ---\n@@ -1 +1 @@\n-oldA\n+newA\n\n--- src/b.ts ---\n@@ -1 +1 @@\n-oldB\n+newB',
        },
      })
      const output = (result.value as ToolCall<'set_output'>).input as any
      expect(output.toolCalls).toHaveLength(1)
      expect(output.toolCalls[0]).toMatchObject({
        toolName: 'propose_edit_transaction',
        input: {
          edits: expect.arrayContaining([
            expect.objectContaining({ path: 'src/a.ts' }),
          ]),
        },
      })
    })

    test('implementor treats nested proposal tool result arrays as successful', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: [
                {
                  file: 'src/example.ts',
                  unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
                },
              ],
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_output',
        input: {
          toolResults: [
            {
              file: 'src/example.ts',
              unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
            },
          ],
          unifiedDiffs: '--- src/example.ts ---\n@@ -1 +1 @@\n-old\n+new',
        },
      })
    })

    test('implementor stops when successful proposal result is only in current step toolResult', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: {
                file: 'src/example.ts',
                unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
              },
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_output',
        input: {
          toolResults: [
            {
              file: 'src/example.ts',
              unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
            },
          ],
          unifiedDiffs: '--- src/example.ts ---\n@@ -1 +1 @@\n-old\n+new',
        },
      })
      expect((result.value as any).toolName).not.toBe('set_messages')
    })

    test('implementor successfully extracts XML-formatted tool calls from assistant message text', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
            {
              type: 'text',
              text: `Here is the proposed change:\n\n<codebuff_tool_call>\n{\n  "cb_tool_name": "propose_str_replace",\n  "path": "src/example.ts",\n  "replacements": [{"oldString": "old", "newString": "new"}],\n  "cb_easp": true\n}\n</codebuff_tool_call>`,
            },
          ],
        },
        {
          role: 'tool',
          toolName: 'propose_str_replace',
          content: [
            {
              type: 'json',
              value: {
                file: 'src/example.ts',
                unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
              },
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_output',
        input: {
          toolCalls: [
            {
              toolName: 'propose_str_replace',
              input: {
                path: 'src/example.ts',
                replacements: [{ oldString: 'old', newString: 'new' }],
              },
            },
          ],
        },
      })
    })

    test('implementor retries XML proposal text when no proposal tool result was recorded', () => {
      const implementor = createBestOfNImplementor({ model: 'gpt-5' })
      const initialMessages = [
        { role: 'user', content: [{ type: 'text', text: 'Initial' }] },
      ]
      const mockAgentState = createMockAgentState(initialMessages)
      const generator = implementor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: {},
      })

      expect(generator.next().value).toBe('STEP')

      const updatedState = createMockAgentState([
        ...initialMessages,
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `<codebuff_tool_call>
{"cb_tool_name":"propose_str_replace","path":"src/example.ts","replacements":[{"oldString":"old","newString":"new"}]}
</codebuff_tool_call>`,
            },
          ],
        },
      ])

      const result = generator.next({
        agentState: updatedState,
        toolResult: [],
        stepsComplete: false,
      })

      expect(result.value).toMatchObject({
        toolName: 'set_messages',
        includeToolCall: false,
      })
      expect((result.value as any).input.messages.at(-1).tags).toContain(
        'PROPOSAL_RETRY',
      )
    })

    test('multi-prompt does not retry when proposal toolResults are nested', () => {
      const multiPromptEditor = createMultiPromptEditor()
      const mockAgentState = createMockAgentState([
        { role: 'user', content: [{ type: 'text', text: 'Original task' }] },
      ])
      const generator = multiPromptEditor.handleSteps!({
        agentState: mockAgentState,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        } as any,
        params: { prompts: ['minimal', 'modular'] },
      })

      expect(
        (generator.next().value as ToolCall<'set_messages'>).toolName,
      ).toBe('set_messages')

      expect(
        generator.next({
          agentState: mockAgentState,
          toolResult: [],
          stepsComplete: false,
        }).value as ToolCall<'spawn_agents'>,
      ).toMatchObject({ toolName: 'spawn_agents' })

      const secondProposalSpawn = generator.next({
        agentState: mockAgentState,
        toolResult: [
          {
            type: 'json',
            value: [
              {
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'src/a.ts',
                        replacements: [{ oldString: 'old', newString: 'new' }],
                      },
                    },
                  ],
                  toolResults: [
                    [{ file: 'src/a.ts', unifiedDiff: '@@ diff A' }],
                  ],
                  unifiedDiffs: '',
                },
              },
            ],
          },
        ],
        stepsComplete: false,
      }).value as ToolCall<'spawn_agents'>

      expect(secondProposalSpawn.input.agents[0].agent_type).toBe(
        'editor-implementor-proposal-2',
      )
      expect(secondProposalSpawn.input.agents[0].prompt).toBe(
        'Strategy: modular',
      )
    })
  })

  describe('multi-prompt serialization-scope safety', () => {
    // handleSteps is serialized via .toString() and re-evaluated in a sandbox
    // without module-level imports. Any helper it calls must be defined inside
    // the function body, or it throws at runtime AFTER proposals are generated
    // (so edits are computed but never applied — the 'changes don't persist'
    // bug). These guards fail loudly if a ranking/validation helper regresses
    // back to a module-scope import.
    const serializedHandleSteps = String(createMultiPromptEditor().handleSteps)

    test('inlines ranking/validation helpers inside the serialized handleSteps scope', () => {
      expect(serializedHandleSteps).toContain('function sameVerificationTier')
      expect(serializedHandleSteps).toContain('function rankVerifiedResults')
      expect(serializedHandleSteps).toContain(
        'function getImplementationDiffSize',
      )
      expect(serializedHandleSteps).toContain('function dryRunStrReplace')
    })

    test('does not reference removed module-scope ranking imports', () => {
      expect(serializedHandleSteps).not.toContain(
        'getRankedImplementationDiffSize',
      )
    })
  })
})
