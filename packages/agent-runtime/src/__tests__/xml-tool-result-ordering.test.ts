import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { beforeEach, describe, expect, it } from 'bun:test'

import { processStreamWithTools } from '../tool-stream-parser'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'

describe('XML tool result ordering', () => {
  async function* createMockStream(chunks: StreamChunk[]) {
    for (const chunk of chunks) {
      yield chunk
    }
    return 'mock-message-id'
  }

  function textChunk(text: string): StreamChunk {
    return { type: 'text' as const, text }
  }

  let agentRuntimeImpl: AgentRuntimeDeps

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }
  })

  it('should call executeXmlToolCall synchronously and track execution order', async () => {
    // This test verifies the execution order when XML tool calls are parsed
    const executionOrder: string[] = []

    // Stream with XML tool call embedded in text
    const xmlToolCall = `<codebuff_tool_call>
{"cb_tool_name": "test_tool", "param1": "value1"}
</codebuff_tool_call>`

    const streamChunks: StreamChunk[] = [
      textChunk('Text before tool call\n'),
      textChunk(xmlToolCall),
      textChunk('\nText after tool call'),
    ]

    const stream = createMockStream(streamChunks)
    const responseChunks: any[] = []

    function onResponseChunk(chunk: any) {
      responseChunks.push(chunk)
    }

    function defaultProcessor(toolName: string) {
      return {
        onTagStart: () => {},
        onTagEnd: () => {},
      }
    }

    for await (const chunk of processStreamWithTools({
      ...agentRuntimeImpl,
      stream,
      processors: {},
      defaultProcessor,
      onError: () => {},
      onResponseChunk,
      executeXmlToolCall: async ({ toolName, input }) => {
        executionOrder.push(`executeXmlToolCall:${toolName}`)
        // Simulate some async work (like tool execution)
        await new Promise((resolve) => setTimeout(resolve, 10))
        executionOrder.push(`executeXmlToolCall:${toolName}:done`)
      },
    })) {
      if (chunk.type === 'text') {
        executionOrder.push(`text:${chunk.text.trim().slice(0, 20)}`)
      } else if (chunk.type === 'tool-call') {
        executionOrder.push(`tool-call:${chunk.toolName}`)
      }
    }

    // The key assertion: executeXmlToolCall should complete BEFORE "Text after" is yielded
    // because the stream should wait for the tool to finish
    console.log('Execution order:', executionOrder)

    const executeStartIndex = executionOrder.findIndex((e) =>
      e.startsWith('executeXmlToolCall:test_tool'),
    )
    const executeDoneIndex = executionOrder.findIndex((e) =>
      e.includes(':done'),
    )
    const textAfterIndex = executionOrder.findIndex((e) =>
      e.includes('Text after'),
    )

    expect(executeStartIndex).toBeGreaterThan(-1)
    expect(executeDoneIndex).toBeGreaterThan(-1)
    
    // The tool execution should complete before "Text after" is processed
    if (textAfterIndex > -1) {
      expect(executeDoneIndex).toBeLessThan(textAfterIndex)
    }
  })

  it('should track tool_call and tool_result events in correct order', async () => {
    // This test simulates what happens in the full processStream flow
    // where we capture both tool_call and tool_result events
    
    const events: { type: string; toolName?: string; order: number }[] = []
    let eventCounter = 0

    const xmlToolCall = `<codebuff_tool_call>
{"cb_tool_name": "read_files", "paths": ["test.ts"]}
</codebuff_tool_call>`

    const streamChunks: StreamChunk[] = [
      textChunk('Before\n'),
      textChunk(xmlToolCall),
      textChunk('\nAfter'),
    ]

    const stream = createMockStream(streamChunks)

    function defaultProcessor(toolName: string) {
      return {
        onTagStart: () => {},
        onTagEnd: () => {},
      }
    }

    // Simulate the xmlToolResponseHandler behavior
    function onResponseChunk(chunk: any) {
      if (chunk.type === 'text') {
        events.push({ type: 'text', order: eventCounter++ })
      }
    }

    for await (const chunk of processStreamWithTools({
      ...agentRuntimeImpl,
      stream,
      processors: {},
      defaultProcessor,
      onError: () => {},
      onResponseChunk,
      executeXmlToolCall: async ({ toolName }) => {
        // Simulate tool_call event
        events.push({ type: 'tool_call', toolName, order: eventCounter++ })
        
        // Simulate async tool execution
        await new Promise((resolve) => setTimeout(resolve, 5))
        
        // Simulate tool_result event
        events.push({ type: 'tool_result', toolName, order: eventCounter++ })
      },
    })) {
      // Consume stream
    }

    // Find the indices
    const toolCallEvent = events.find((e) => e.type === 'tool_call')
    const toolResultEvent = events.find((e) => e.type === 'tool_result')
    const textAfterEvents = events.filter(
      (e) => e.type === 'text' && e.order > (toolCallEvent?.order ?? 0),
    )

    expect(toolCallEvent).toBeDefined()
    expect(toolResultEvent).toBeDefined()

    // The tool_result should come immediately after tool_call,
    // before any subsequent text events
    if (toolResultEvent && textAfterEvents.length > 0) {
      const firstTextAfter = textAfterEvents[0]
      expect(toolResultEvent.order).toBeLessThan(firstTextAfter.order)
    }
  })

  it('should not deadlock when executeXmlToolCall awaits tool execution', async () => {
    // This test verifies that awaiting inside executeXmlToolCall doesn't cause a deadlock.
    // The fix: pass Promise.resolve() instead of previousToolCallFinished for XML mode,
    // so the tool can execute immediately without waiting for the stream to finish.
    
    const xmlToolCall = `<codebuff_tool_call>
{"cb_tool_name": "test_tool", "param": "value"}
</codebuff_tool_call>`

    const streamChunks: StreamChunk[] = [
      textChunk('Before\n'),
      textChunk(xmlToolCall),
      textChunk('\nAfter'),
    ]

    const stream = createMockStream(streamChunks)
    let toolExecuted = false

    // This test should complete within a reasonable time.
    // Before the fix, it would deadlock because:
    // 1. executeXmlToolCall awaits toolPromise
    // 2. toolPromise chains on previousToolCallFinished (streamDonePromise)
    // 3. streamDonePromise only resolves when stream ends
    // 4. Stream can't end because it's waiting for executeXmlToolCall
    // => Deadlock!
    
    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), 1000),
    )

    const streamPromise = (async () => {
      for await (const chunk of processStreamWithTools({
        ...agentRuntimeImpl,
        stream,
        processors: {},
        defaultProcessor: () => ({ onTagStart: () => {}, onTagEnd: () => {} }),
        onError: () => {},
        onResponseChunk: () => {},
        executeXmlToolCall: async () => {
          // Simulate tool execution with async work
          await new Promise((resolve) => setTimeout(resolve, 50))
          toolExecuted = true
        },
      })) {
        // Consume stream
      }
      return 'completed'
    })()

    const result = await Promise.race([streamPromise, timeoutPromise])

    expect(result).toBe('completed')
    expect(toolExecuted).toBe(true)
  })
})
