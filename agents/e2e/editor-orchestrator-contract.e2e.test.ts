import { describe, expect, test } from 'bun:test'

import { createMessageUpdater } from '../../cli/src/utils/message-updater'
import { createEventHandler } from '../../cli/src/utils/sdk-event-handlers'
import { validateAgentInput } from '../../packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils'
import { createBase2 } from '../base2/base2'

import type { ChatMessage } from '../../cli/src/types/chat'
import type { EventHandlerState } from '../../cli/src/utils/sdk-event-handlers'
import type { AgentTemplate } from '../../packages/agent-runtime/src/templates/types'
import type { Logger } from '@codebuff/common/types/contracts/logger'

function feedJson(value: unknown) {
  return { toolResult: [{ type: 'json', value }] } as any
}

function createCliContext() {
  let messages: ChatMessage[] = [
    {
      id: 'ai-1',
      variant: 'ai',
      content: '',
      blocks: [],
      timestamp: 'now',
    },
  ]
  const updater = createMessageUpdater('ai-1', (update) => {
    messages = update(messages)
  })
  const noop = () => {}
  const ctx: EventHandlerState = {
    streaming: {
      streamRefs: {
        state: {
          rootStreamBuffer: '',
          agentStreamAccumulators: new Map(),
          rootStreamSeen: false,
          planExtracted: false,
          wasAbortedByUser: false,
          spawnAgentsMap: new Map(),
          phase: null,
        },
        reset: noop,
        setters: {
          setRootStreamBuffer: noop,
          appendRootStreamBuffer: noop,
          setAgentAccumulator: noop,
          removeAgentAccumulator: noop,
          setRootStreamSeen: noop,
          setPlanExtracted: noop,
          setWasAbortedByUser: noop,
          setSpawnAgentInfo: noop,
          removeSpawnAgentInfo: noop,
          setPhase: noop,
        },
      },
      setStreamingAgents: noop,
      setStreamStatus: noop,
      setContextWindowUsage: noop,
    },
    message: {
      aiMessageId: 'ai-1',
      updater,
      hasReceivedContentRef: { current: false },
    },
    subagents: { addActiveSubagent: noop, removeActiveSubagent: noop },
    mode: { agentMode: 'DEFAULT', setHasReceivedPlanResponse: noop },
    logger: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
    } as Logger,
    setIsRetrying: noop,
  }
  return { ctx, getMessages: () => messages }
}

describe('editor to orchestrator contract e2e', () => {
  test('validated brief and canonical edit receipt reach the parent gate and CLI', () => {
    const brief = [
      '## Requirements',
      '- Change src/lifecycle.ts while preserving its public API.',
      '## Target files',
      '- src/lifecycle.ts (read before editing).',
      '## Constraints/non-goals',
      '- Do not change unrelated files or run parent validation.',
      '## Patterns',
      '- Follow the existing lifecycle state transition style.',
      '## Risks',
      '- Preserve retry idempotency and mutation receipt correlation.',
    ].join('\n')
    const editorTemplate = {
      id: 'editor',
      inputSchema: { prompt: { safeParse: () => ({ success: true }) } },
    } as unknown as AgentTemplate
    expect(() =>
      validateAgentInput(editorTemplate, 'editor', brief),
    ).not.toThrow()

    const receipt = {
      kind: 'file_mutation_result',
      version: 1,
      operationId: 'editor-op-1',
      receiptId: 'editor-receipt-1',
      outcome: 'applied',
      authorityTier: 'conditional_commit',
      actions: [
        {
          actionId: 'editor-action-1',
          index: 0,
          action: 'update',
          path: 'src/lifecycle.ts',
          outcome: 'applied',
          beforeHash: 'before',
          afterHash: 'after',
        },
      ],
      authorityReceipt: {
        operationId: 'editor-op-1',
        receiptId: 'editor-receipt-1',
        actions: [{ actionId: 'editor-action-1' }],
      },
      errors: [],
      freshCapabilities: [],
    }

    const base2 = createBase2('default')
    const agentState = { agentId: 'base2-custom' }
    const generator = base2.handleSteps!({
      agentState,
      prompt: 'Implement the lifecycle update.',
      params: {},
    } as any)
    expect(generator.next().value).toMatchObject({ toolName: 'query_index' })
    expect(generator.next(feedJson([])).value).toMatchObject({
      toolName: 'add_message',
    })
    expect(generator.next().value).toMatchObject({
      toolName: 'git_status',
    })
    expect(generator.next(feedJson({ status: '' })).value).toMatchObject({
      toolName: 'spawn_agent_inline',
    })
    expect(generator.next().value).toBe('STEP')
    expect(
      generator.next({
        agentState: agentState as any,
        stepsComplete: true,
        toolResult: feedJson(receipt).toolResult,
      }).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(generator.next(feedJson({ status: ' M src/lifecycle.ts' })).value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/lifecycle.ts'] },
    })
    expect((agentState as any).base2ActiveWork).toMatchObject({
      changedFiles: ['src/lifecycle.ts'],
      pendingGateFiles: ['src/lifecycle.ts'],
    })

    const { ctx, getMessages } = createCliContext()
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'subagent_start',
      agentId: 'editor-1',
      agentType: 'editor',
      displayName: 'Editor',
      parentAgentId: 'base2-custom',
      spawnToolCallId: 'spawn-editor',
      spawnIndex: 0,
      prompt: brief,
      onlyChild: true,
    } as any)
    handleEvent({
      type: 'subagent_finish',
      agentId: 'editor-1',
      agentType: 'editor',
      displayName: 'Editor',
      parentAgentId: 'base2-custom',
      onlyChild: true,
      output: { changedFiles: ['src/lifecycle.ts'] },
    } as any)
    expect(getMessages()[0].blocks?.[0]).toMatchObject({
      type: 'agent',
      agentType: 'editor',
      status: 'complete',
    })
  })
})
