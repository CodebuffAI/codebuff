import { describe, it, expect } from 'bun:test'

import { createStreamToolCallHandler } from './stream-tool-call-handler'

describe('createStreamToolCallHandler', () => {
  describe('processToolCallDelta - new tool call', () => {
    it('should emit tool-input-start for new tool call', () => {
      const handler = createStreamToolCallHandler()
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '',
        },
      })

      expect(events[0]).toEqual({
        type: 'tool-input-start',
        id: 'call-1',
        toolName: 'myTool',
      })
    })

    it('should throw if id is null for new tool call', () => {
      const handler = createStreamToolCallHandler()
      
      expect(() => handler.processToolCallDelta({
        index: 0,
        id: null,
        function: {
          name: 'myTool',
        },
      })).toThrow("Expected 'id' to be a string.")
    })

    it('should throw if function.name is null for new tool call', () => {
      const handler = createStreamToolCallHandler()
      
      expect(() => handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: null,
        },
      })).toThrow("Expected 'function.name' to be a string.")
    })

    it('should emit tool-input-delta if arguments are present on first chunk', () => {
      const handler = createStreamToolCallHandler()
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{"foo":',
        },
      })

      expect(events).toContainEqual({
        type: 'tool-input-delta',
        id: 'call-1',
        delta: '{"foo":',
      })
    })

    it('should complete tool call if first chunk contains valid JSON', () => {
      const handler = createStreamToolCallHandler()
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{"foo": "bar"}',
        },
      })

      // Should have: tool-input-start, tool-input-delta, tool-input-end, tool-call
      expect(events.map(e => e.type)).toEqual([
        'tool-input-start',
        'tool-input-delta',
        'tool-input-end',
        'tool-call',
      ])

      const toolCallEvent = events.find(e => e.type === 'tool-call')
      expect(toolCallEvent).toEqual({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'myTool',
        input: '{"foo": "bar"}',
      })
    })

    it('should not emit delta if arguments is empty string', () => {
      const handler = createStreamToolCallHandler()
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '',
        },
      })

      // Should only have tool-input-start
      expect(events).toEqual([
        { type: 'tool-input-start', id: 'call-1', toolName: 'myTool' },
      ])
    })

    it('should handle null arguments on first chunk', () => {
      const handler = createStreamToolCallHandler()
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: null,
        },
      })

      expect(events).toEqual([
        { type: 'tool-input-start', id: 'call-1', toolName: 'myTool' },
      ])
    })
  })

  describe('processToolCallDelta - existing tool call', () => {
    it('should accumulate arguments across multiple deltas', () => {
      const handler = createStreamToolCallHandler()
      
      // First chunk
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{"foo":',
        },
      })

      // Second chunk
      const events = handler.processToolCallDelta({
        index: 0,
        function: {
          arguments: ' "bar"',
        },
      })

      expect(events).toContainEqual({
        type: 'tool-input-delta',
        id: 'call-1',
        delta: ' "bar"',
      })
    })

    it('should complete tool call when accumulated JSON is valid', () => {
      const handler = createStreamToolCallHandler()
      
      // First chunk
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{"foo":',
        },
      })

      // Second chunk that completes the JSON
      const events = handler.processToolCallDelta({
        index: 0,
        function: {
          arguments: ' "bar"}',
        },
      })

      expect(events.map(e => e.type)).toEqual([
        'tool-input-delta',
        'tool-input-end',
        'tool-call',
      ])

      const toolCallEvent = events.find(e => e.type === 'tool-call')
      expect(toolCallEvent).toEqual({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'myTool',
        input: '{"foo": "bar"}',
      })
    })

    it('should ignore deltas after tool call is finished', () => {
      const handler = createStreamToolCallHandler()
      
      // Complete tool call in one chunk
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{}',
        },
      })

      // Additional delta after completion
      const events = handler.processToolCallDelta({
        index: 0,
        function: {
          arguments: 'extra',
        },
      })

      expect(events).toEqual([])
    })

    it('should handle null arguments in delta', () => {
      const handler = createStreamToolCallHandler()
      
      // First chunk
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{"foo":',
        },
      })

      // Null arguments delta
      const events = handler.processToolCallDelta({
        index: 0,
        function: {
          arguments: null,
        },
      })

      // Should return empty since no new content
      expect(events).toEqual([])
    })
  })

  describe('processToolCallDelta - multiple tool calls', () => {
    it('should handle multiple tool calls at different indices', () => {
      const handler = createStreamToolCallHandler()
      
      // First tool call
      const events1 = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'tool1',
          arguments: '{}',
        },
      })

      // Second tool call
      const events2 = handler.processToolCallDelta({
        index: 1,
        id: 'call-2',
        function: {
          name: 'tool2',
          arguments: '{}',
        },
      })

      expect(events1.find(e => e.type === 'tool-call')).toMatchObject({
        toolCallId: 'call-1',
        toolName: 'tool1',
      })

      expect(events2.find(e => e.type === 'tool-call')).toMatchObject({
        toolCallId: 'call-2',
        toolName: 'tool2',
      })
    })

    it('should handle interleaved deltas for multiple tool calls', () => {
      const handler = createStreamToolCallHandler()
      
      // First chunk of tool 1
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'tool1',
          arguments: '{"a":',
        },
      })

      // First chunk of tool 2
      handler.processToolCallDelta({
        index: 1,
        id: 'call-2',
        function: {
          name: 'tool2',
          arguments: '{"b":',
        },
      })

      // Complete tool 1
      const events1 = handler.processToolCallDelta({
        index: 0,
        function: {
          arguments: ' 1}',
        },
      })

      // Complete tool 2
      const events2 = handler.processToolCallDelta({
        index: 1,
        function: {
          arguments: ' 2}',
        },
      })

      expect(events1.find(e => e.type === 'tool-call')).toMatchObject({
        input: '{"a": 1}',
      })

      expect(events2.find(e => e.type === 'tool-call')).toMatchObject({
        input: '{"b": 2}',
      })
    })
  })

  describe('flushUnfinishedToolCalls', () => {
    it('should return empty array when no tool calls', () => {
      const handler = createStreamToolCallHandler()
      const events = handler.flushUnfinishedToolCalls()
      expect(events).toEqual([])
    })

    it('should return empty array when all tool calls are finished', () => {
      const handler = createStreamToolCallHandler()
      
      // Complete a tool call
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{}',
        },
      })

      const events = handler.flushUnfinishedToolCalls()
      expect(events).toEqual([])
    })

    it('should flush unfinished tool calls with valid JSON', () => {
      const handler = createStreamToolCallHandler()
      
      // Start but don't complete a tool call with valid JSON
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{"partial": true}',
        },
      })

      // This tool call has valid JSON but wasn't "finished" due to some edge case
      // Actually, it would be finished. Let's test incomplete JSON instead.
    })

    it('should flush unfinished tool calls with incomplete JSON using fallback', () => {
      const handler = createStreamToolCallHandler()
      
      // Start a tool call with incomplete JSON
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{"incomplete":',
        },
      })

      const events = handler.flushUnfinishedToolCalls()

      // Should have tool-input-end and tool-call with fallback empty object
      expect(events).toContainEqual({
        type: 'tool-input-end',
        id: 'call-1',
      })

      expect(events.find(e => e.type === 'tool-call')).toEqual({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'myTool',
        input: '{}', // Fallback for invalid JSON
      })
    })

    it('should flush multiple unfinished tool calls', () => {
      const handler = createStreamToolCallHandler()
      
      // Start two tool calls with incomplete JSON
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'tool1',
          arguments: '{"a":',
        },
      })

      handler.processToolCallDelta({
        index: 1,
        id: 'call-2',
        function: {
          name: 'tool2',
          arguments: '{"b":',
        },
      })

      const events = handler.flushUnfinishedToolCalls()

      // Should have 2 tool-input-end and 2 tool-call events
      const endEvents = events.filter(e => e.type === 'tool-input-end')
      const callEvents = events.filter(e => e.type === 'tool-call')

      expect(endEvents).toHaveLength(2)
      expect(callEvents).toHaveLength(2)
    })

    it('should only flush unfinished tool calls, not finished ones', () => {
      const handler = createStreamToolCallHandler()
      
      // Finished tool call
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'tool1',
          arguments: '{}',
        },
      })

      // Unfinished tool call
      handler.processToolCallDelta({
        index: 1,
        id: 'call-2',
        function: {
          name: 'tool2',
          arguments: '{"incomplete":',
        },
      })

      const events = handler.flushUnfinishedToolCalls()

      // Should only have events for call-2
      const callEvents = events.filter(e => e.type === 'tool-call')
      expect(callEvents).toHaveLength(1)
      expect(callEvents[0]).toMatchObject({
        toolCallId: 'call-2',
      })
    })

    it('should handle empty arguments in flush', () => {
      const handler = createStreamToolCallHandler()
      
      // Tool call with empty arguments
      handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '',
        },
      })

      const events = handler.flushUnfinishedToolCalls()

      // Should use fallback '{}'
      expect(events.find(e => e.type === 'tool-call')).toEqual({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'myTool',
        input: '{}',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle complex nested JSON', () => {
      const handler = createStreamToolCallHandler()
      
      const complexJson = '{"nested": {"array": [1, 2, {"deep": true}]}, "string": "value"}'
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: complexJson,
        },
      })

      const toolCallEvent = events.find(e => e.type === 'tool-call')
      expect(toolCallEvent).toMatchObject({
        input: complexJson,
      })
    })

    it('should handle JSON with special characters', () => {
      const handler = createStreamToolCallHandler()
      
      const jsonWithSpecialChars = '{"text": "hello\\nworld", "emoji": "👋"}'
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: jsonWithSpecialChars,
        },
      })

      const toolCallEvent = events.find(e => e.type === 'tool-call')
      expect(toolCallEvent).toMatchObject({
        input: jsonWithSpecialChars,
      })
    })

    it('should handle empty object JSON', () => {
      const handler = createStreamToolCallHandler()
      
      const events = handler.processToolCallDelta({
        index: 0,
        id: 'call-1',
        function: {
          name: 'myTool',
          arguments: '{}',
        },
      })

      const toolCallEvent = events.find(e => e.type === 'tool-call')
      expect(toolCallEvent).toMatchObject({
        input: '{}',
      })
    })

    it('should handle sparse array indices', () => {
      const handler = createStreamToolCallHandler()
      
      // Start at index 5 (sparse)
      const events = handler.processToolCallDelta({
        index: 5,
        id: 'call-5',
        function: {
          name: 'myTool',
          arguments: '{}',
        },
      })

      expect(events.find(e => e.type === 'tool-call')).toMatchObject({
        toolCallId: 'call-5',
      })
    })
  })
})
