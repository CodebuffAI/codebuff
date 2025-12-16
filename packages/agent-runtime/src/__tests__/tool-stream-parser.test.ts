import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { beforeEach, describe, expect, it } from 'bun:test'

import { processStreamWithTools } from '../tool-stream-parser'
import { createToolCallChunk } from './test-utils'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'

describe('processStreamWithTags', () => {
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

  it('should handle basic tool call parsing', async () => {
    const streamChunks: StreamChunk[] = [
      createToolCallChunk('test_tool', { param1: 'value1' }),
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test_tool: {
        params: ['param1'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result: string[] = []
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
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      if (chunk.type === 'text') {
        result.push(chunk.text)
      }
    }

    expect(events).toEqual([
      {
        tagName: 'test_tool',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'test_tool',
        type: 'end',
        params: { param1: 'value1' },
      },
    ])
  })

  it('should handle tool calls with text before', async () => {
    const streamChunks: StreamChunk[] = [
      textChunk('Some text before tool call'),
      createToolCallChunk('test_tool', { param1: 'value1' }),
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test_tool: {
        params: ['param1'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result: string[] = []
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
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      if (chunk.type === 'text') {
        result.push(chunk.text)
      }
    }

    expect(events).toEqual([
      {
        tagName: 'test_tool',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'test_tool',
        type: 'end',
        params: { param1: 'value1' },
      },
    ])
  })

  it('should handle multiple tool calls in sequence', async () => {
    const streamChunks: StreamChunk[] = [
      createToolCallChunk('tool1', { param1: 'value1' }),
      textChunk('text between tools'),
      createToolCallChunk('tool2', { param2: 'value2' }),
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      tool1: {
        params: ['param1'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
      tool2: {
        params: ['param2'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result: string[] = []
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
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      if (chunk.type === 'text') {
        result.push(chunk.text)
      }
    }

    expect(events).toEqual([
      {
        tagName: 'tool1',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'tool1',
        type: 'end',
        params: { param1: 'value1' },
      },
      {
        tagName: 'tool2',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'tool2',
        type: 'end',
        params: { param2: 'value2' },
      },
    ])
  })

  it('should handle unknown tool names via defaultProcessor', async () => {
    const streamChunks: StreamChunk[] = [
      createToolCallChunk('unknown_tool', { param1: 'value1' }),
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test_tool: {
        params: ['param1'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error, type: 'error' })
    }

    const responseChunks: any[] = []

    function onResponseChunk(chunk: any) {
      responseChunks.push(chunk)
    }

    function defaultProcessor(toolName: string) {
      // For unknown tools, still return a processor but track the error
      events.push({
        name: toolName,
        error: `Tool not found: ${toolName}`,
        type: 'error',
      })
      return {
        onTagStart: () => {},
        onTagEnd: () => {},
      }
    }

    for await (const chunk of processStreamWithTools({
      ...agentRuntimeImpl,
      stream,
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      // consume stream
    }

    expect(events).toEqual([
      {
        name: 'unknown_tool',
        error: 'Tool not found: unknown_tool',
        type: 'error',
      },
    ])
  })

  it('should handle tool calls with complex parameters', async () => {
    const streamChunks: StreamChunk[] = [
      createToolCallChunk('complex_tool', {
        array_param: ['item1', 'item2'],
        object_param: { nested: 'value' },
        boolean_param: true,
        number_param: 42,
      }),
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      complex_tool: {
        params: [
          'array_param',
          'object_param',
          'boolean_param',
          'number_param',
        ] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, any>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error, type: 'error' })
    }

    const result: string[] = []
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
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      if (chunk.type === 'text') {
        result.push(chunk.text)
      }
    }

    expect(events).toEqual([
      {
        tagName: 'complex_tool',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'complex_tool',
        type: 'end',
        params: {
          array_param: ['item1', 'item2'],
          object_param: { nested: 'value' },
          boolean_param: true,
          number_param: 42,
        },
      },
    ])
  })

  it('should handle text content mixed with tool calls', async () => {
    const streamChunks: StreamChunk[] = [
      textChunk('Some text before'),
      createToolCallChunk('test_tool', { param1: 'value1' }),
      textChunk('Some text after'),
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test_tool: {
        params: ['param1'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error, type: 'error' })
    }

    const result: string[] = []
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
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      if (chunk.type === 'text') {
        result.push(chunk.text)
      }
    }

    expect(events).toEqual([
      {
        tagName: 'test_tool',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'test_tool',
        type: 'end',
        params: { param1: 'value1' },
      },
    ])
  })

  it('should handle empty stream', async () => {
    const streamChunks: StreamChunk[] = []
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {}

    function onError(name: string, error: string) {
      events.push({ name, error, type: 'error' })
    }

    const result: string[] = []
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
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      if (chunk.type === 'text') {
        result.push(chunk.text)
      }
    }

    expect(events).toEqual([])
    expect(result).toEqual([])
  })

  it('should handle stream with only text content', async () => {
    const streamChunks: StreamChunk[] = [
      textChunk('Just some text'),
      textChunk(' with no tool calls'),
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {}

    function onError(name: string, error: string) {
      events.push({ name, error, type: 'error' })
    }

    const result: string[] = []
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
      processors,
      defaultProcessor,
      onError,
      onResponseChunk,
      executeXmlToolCall: async () => {},
    })) {
      if (chunk.type === 'text') {
        result.push(chunk.text)
      }
    }

    expect(events).toEqual([])
  })
})
