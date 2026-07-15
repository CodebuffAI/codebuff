import * as mainPromptModule from '@codebuff/agent-runtime/main-prompt'
import * as mcpClientModule from '@codebuff/common/mcp/client'
import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { getStubProjectFileContext } from '@codebuff/common/util/file'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import nodeFs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import z from 'zod/v4'

import { OpenbuffClient } from '../client'
import { getCustomToolDefinition } from '../custom-tool'
import * as databaseModule from '../impl/database'

import type { OpenbuffClientOptions } from '../run'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { MCPConfig } from '@codebuff/common/types/mcp'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

describe('OpenbuffClient handleEvent / handleStreamChunk', () => {
  const harnessStateDirs: string[] = []

  afterEach(() => {
    mock.restore()
    for (const stateDir of harnessStateDirs.splice(0)) {
      nodeFs.rmSync(stateDir, { recursive: true, force: true })
    }
  })

  it('handles create_plan tool calls by writing the plan artifact', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    let createPlanResult: ToolResultOutput[] | undefined

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        createPlanResult = (
          await requestToolCall({
            userInputId: promptId,
            toolName: 'create_plan',
            input: {
              type: 'file',
              path: '.agents/sessions/test-session/PLAN.md',
              content: '# Plan\n\n- Write the plan artifact\n',
            },
          })
        ).output

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const fs = createMockFs()
    const mutationEvents: Array<{
      workspaceRevision: number
      actions: Array<{ action: string; path: string }>
    }> = []
    let fallbackInvalidations = 0
    const harnessStateDir = nodeFs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-run-event-'),
    )
    harnessStateDirs.push(harnessStateDir)
    const client = new OpenbuffClient({
      apiKey: 'test-key',
      cwd: '/repo',
      fsSource: fs,
      harnessStateDir,
      onFilesystemMutation: (event) => {
        mutationEvents.push(event)
      },
      onFilesChanged: () => fallbackInvalidations++,
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'create a plan',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(
      createPlanResult?.[0]?.type === 'json' ? createPlanResult[0].value : null,
    ).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      workspaceRevision: 1,
      workspaceSnapshotId: expect.stringContaining('workspace.v1.1.'),
      authorityReceipt: expect.objectContaining({
        workspaceRevision: 1,
        workspaceSnapshotId: expect.stringContaining('workspace.v1.1.'),
      }),
      actions: [
        expect.objectContaining({
          action: 'create',
          path: '.agents/sessions/test-session/PLAN.md',
        }),
      ],
    })
    expect(
      await fs.readFile('/repo/.agents/sessions/test-session/PLAN.md', 'utf-8'),
    ).toBe('# Plan\n\n- Write the plan artifact\n')
    expect(mutationEvents).toEqual([
      expect.objectContaining({
        workspaceRevision: 1,
        actions: [
          expect.objectContaining({
            action: 'create',
            path: '.agents/sessions/test-session/PLAN.md',
          }),
        ],
      }),
    ])
    expect(fallbackInvalidations).toBe(0)
  })

  it('validates overridden native client tool inputs before calling the override', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    let globResult: ToolResultOutput[] | undefined
    let overrideCalled = false

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        globResult = (
          await requestToolCall({
            userInputId: promptId,
            toolName: 'glob',
            input: {},
          })
        ).output

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      overrideTools: {
        glob: async () => {
          overrideCalled = true
          return [{ type: 'json', value: { files: [] } }]
        },
      },
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'glob files',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(overrideCalled).toBe(false)
    const firstOutput = globResult?.[0]
    expect(firstOutput?.type).toBe('json')
    if (firstOutput?.type !== 'json') {
      throw new Error(
        'Expected glob override validation to return a JSON error',
      )
    }
    expect(firstOutput.value).toMatchObject({
      errorMessage: expect.stringContaining('Invalid input'),
    })
  })

  it('allows overrideTools to handle published tools that the SDK does not implement natively', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    let readDocsResult: ToolResultOutput[] | undefined

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        readDocsResult = (
          await requestToolCall({
            userInputId: promptId,
            toolName: 'read_docs',
            input: {
              libraryTitle: 'React',
              topic: 'hooks',
            },
          })
        ).output

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      overrideTools: {
        read_docs: async () => [
          {
            type: 'json',
            value: { docs: 'override docs' },
          },
        ],
      },
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'read docs',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(readDocsResult).toEqual([
      {
        type: 'json',
        value: { docs: 'override docs' },
      },
    ])
  })

  it('[ABI-H01] never dispatches apply_patch through a write_file override', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    let writeOverrideCalled = false
    let patchResult: ToolResultOutput[] | undefined
    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())
        patchResult = (
          await requestToolCall({
            userInputId: promptId,
            toolName: 'apply_patch',
            input: {
              operation: {
                type: 'create_file',
                path: 'new.txt',
                diff: '@@\n+new\n',
              },
            },
          })
        ).output
        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: { type: 'lastMessage', value: [] },
          },
        })
        return {
          sessionState,
          output: { type: 'lastMessage' as const, value: [] },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      overrideTools: {
        write_file: async () => {
          writeOverrideCalled = true
          return [{ type: 'json', value: { message: 'legacy write' } }]
        },
      },
    })
    await client.run({ agent: 'base2', prompt: 'apply patch' })

    expect(writeOverrideCalled).toBe(false)
    expect(patchResult?.[0]).toMatchObject({
      type: 'json',
      value: { errorMessage: expect.stringContaining('cwd is required') },
    })
  })

  it('[ABI-H03][MUT-M05] external mutation overrides cannot self-certify application', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    let overrideResult: ToolResultOutput[] | undefined
    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())
        overrideResult = (
          await requestToolCall({
            userInputId: promptId,
            toolName: 'write_file',
            input: { type: 'file', path: 'fake.txt', content: 'fake' },
          })
        ).output
        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: { type: 'lastMessage', value: [] },
          },
        })
        return {
          sessionState,
          output: { type: 'lastMessage' as const, value: [] },
        }
      },
    )

    let changedCalls = 0
    const client = new OpenbuffClient({
      apiKey: 'test-key',
      onFilesChanged: () => changedCalls++,
      overrideTools: {
        write_file: async () => [
          {
            type: 'json',
            value: {
              kind: 'file_mutation_result',
              version: 1,
              operationId: 'fabricated',
              outcome: 'applied',
              actions: [
                {
                  actionId: 'fabricated:0',
                  index: 0,
                  action: 'create',
                  path: 'fake.txt',
                  outcome: 'applied',
                  beforeHash: null,
                  afterHash: 'fake-hash',
                },
              ],
              authorityTier: 'portable_path',
              receiptId: 'fabricated',
              errors: [],
              freshCapabilities: [],
            },
          },
        ],
      },
    })
    await client.run({ agent: 'base2', prompt: 'write fake file' })

    expect(overrideResult?.[0]).toMatchObject({
      type: 'json',
      value: {
        kind: 'file_mutation_result',
        outcome: 'unconfirmed',
        authorityTier: null,
        actions: [expect.objectContaining({ outcome: 'unconfirmed' })],
      },
    })
    expect(changedCalls).toBe(0)
  })

  it('returns the SDK unsupported-tool error for published tools without native handlers', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    let readDocsResult: ToolResultOutput[] | undefined

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        readDocsResult = (
          await requestToolCall({
            userInputId: promptId,
            toolName: 'read_docs',
            input: {
              libraryTitle: 'React',
              topic: 'hooks',
            },
          })
        ).output

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'read docs',
    })

    expect(result.output.type).toBe('lastMessage')
    expect(readDocsResult).toEqual([
      {
        type: 'json',
        value: {
          errorMessage:
            'Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: read_docs',
        },
      },
    ])
  })

  it('passes the run abort signal to custom tool execution context', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    const controller = new AbortController()
    let observedSignal: AbortSignal | undefined
    const customTool = getCustomToolDefinition({
      toolName: 'observe_signal',
      inputSchema: z.object({}),
      description: 'Observes the run abort signal',
      execute: async (_input, context) => {
        observedSignal = context?.signal
        return [{ type: 'json', value: { ok: true } }]
      },
    })

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        await requestToolCall({
          userInputId: promptId,
          toolName: 'observe_signal',
          input: {},
        })

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
      customToolDefinitions: [customTool],
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'use custom tool',
      signal: controller.signal,
    })

    expect(result.output.type).toBe('lastMessage')
    expect(observedSignal).toBe(controller.signal)
  })

  it('passes the run abort signal to MCP tool execution options', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    const controller = new AbortController()
    const mcpConfig: MCPConfig = {
      type: 'stdio',
      command: 'fake-mcp-server',
      args: [],
      env: {},
    }
    let observedSignal: AbortSignal | undefined

    spyOn(mcpClientModule, 'getMCPClient').mockResolvedValue('mcp-client-id')
    spyOn(mcpClientModule, 'callMCPTool').mockImplementation(
      async (...args: Parameters<typeof mcpClientModule.callMCPTool>) => {
        observedSignal = args[3]?.signal
        return [{ type: 'json', value: { ok: true } }]
      },
    )

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { requestToolCall, sendAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        await requestToolCall({
          userInputId: promptId,
          toolName: 'mcp_tool',
          input: { value: 'hello' },
          mcpConfig,
        })

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    const client = new OpenbuffClient({
      apiKey: 'test-key',
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'use mcp tool',
      signal: controller.signal,
    })

    expect(result.output.type).toBe('lastMessage')
    expect(observedSignal).toBe(controller.signal)
  })

  it('streams subagent start/finish once and forwards subagent chunks to handleStreamChunk', async () => {
    spyOn(databaseModule, 'getUserInfoFromApiKey').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      discord_id: null,
      stripe_customer_id: null,
      banned: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    })
    spyOn(databaseModule, 'fetchAgentFromDatabase').mockResolvedValue(null)
    spyOn(databaseModule, 'startAgentRun').mockResolvedValue('run-1')
    spyOn(databaseModule, 'finishAgentRun').mockResolvedValue(undefined)
    spyOn(databaseModule, 'addAgentStep').mockResolvedValue('step-1')

    spyOn(mainPromptModule, 'callMainPrompt').mockImplementation(
      async (params: Parameters<typeof mainPromptModule.callMainPrompt>[0]) => {
        const { sendAction, action: promptAction, promptId } = params
        const sessionState = getInitialSessionState(getStubProjectFileContext())

        await sendAction({
          action: {
            type: 'response-chunk',
            userInputId: promptId,
            chunk: {
              type: 'subagent_start',
              agentId: 'sub-1',
              agentType: 'commander',
              displayName: 'Commander',
              onlyChild: true,
              parentAgentId: 'main-agent',
              prompt: promptAction.prompt,
              params: promptAction.promptParams,
            },
          },
        })

        await sendAction({
          action: {
            type: 'subagent-response-chunk',
            userInputId: promptId,
            agentId: 'sub-1',
            agentType: 'commander',
            chunk: 'hello from subagent',
          },
        })

        await sendAction({
          action: {
            type: 'response-chunk',
            userInputId: promptId,
            chunk: {
              type: 'subagent_finish',
              agentId: 'sub-1',
              agentType: 'commander',
              displayName: 'Commander',
              onlyChild: true,
              parentAgentId: 'main-agent',
              prompt: promptAction.prompt,
              params: promptAction.promptParams,
            },
          },
        })

        await sendAction({
          action: {
            type: 'prompt-response',
            promptId,
            sessionState,
            output: {
              type: 'lastMessage',
              value: [],
            },
          },
        })

        return {
          sessionState,
          output: {
            type: 'lastMessage' as const,
            value: [],
          },
        }
      },
    )

    type StreamChunk = Parameters<
      NonNullable<OpenbuffClientOptions['handleStreamChunk']>
    >[0]

    const events: PrintModeEvent[] = []
    const streamChunks: StreamChunk[] = []
    const callbackOrder: string[] = []

    const client = new OpenbuffClient({
      apiKey: 'test-key',
    })

    const result = await client.run({
      agent: 'base2',
      prompt: 'hello world',
      handleEvent: async (event) => {
        callbackOrder.push(`event:${event.type}:start`)
        if (event.type === 'subagent_start') {
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
        events.push(event)
        callbackOrder.push(`event:${event.type}:end`)
      },
      handleStreamChunk: async (chunk) => {
        callbackOrder.push('chunk:start')
        await Promise.resolve()
        streamChunks.push(chunk)
        callbackOrder.push('chunk:end')
      },
    })

    expect(
      events.filter((e) => e.type === 'subagent_start').map((e) => e.agentId),
    ).toEqual(['sub-1'])
    expect(
      events.filter((e) => e.type === 'subagent_finish').map((e) => e.agentId),
    ).toEqual(['sub-1'])

    expect(streamChunks).toEqual([
      {
        type: 'subagent_chunk',
        agentId: 'sub-1',
        agentType: 'commander',
        chunk: 'hello from subagent',
      },
    ])

    expect(result.output.type).toBe('lastMessage')
    expect(callbackOrder).toEqual([
      'event:subagent_start:start',
      'event:subagent_start:end',
      'chunk:start',
      'chunk:end',
      'event:subagent_finish:start',
      'event:subagent_finish:end',
    ])
  })
})
