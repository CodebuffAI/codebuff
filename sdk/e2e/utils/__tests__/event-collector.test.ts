/**
 * Unit Tests: EventCollector
 *
 * Tests the EventCollector utility class in isolation without any API calls.
 */

import { describe, test, expect, beforeEach } from 'bun:test'

import { EventCollector } from '../event-collector'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

describe('Unit: EventCollector', () => {
  let collector: EventCollector

  beforeEach(() => {
    collector = new EventCollector()
  })

  describe('handleEvent', () => {
    test('collects events when handleEvent is called', () => {
      const event: PrintModeEvent = { type: 'start', messageHistoryLength: 0 }
      collector.handleEvent(event)

      expect(collector.events).toHaveLength(1)
      expect(collector.events[0]).toEqual(event)
    })

    test('collects multiple events in order', () => {
      const events: PrintModeEvent[] = [
        { type: 'start', messageHistoryLength: 0 },
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' World' },
        { type: 'finish', totalCost: 0.001 },
      ]

      for (const event of events) {
        collector.handleEvent(event)
      }

      expect(collector.events).toHaveLength(4)
      expect(collector.events).toEqual(events)
    })

    test('tracks error events separately', () => {
      const errorEvent: PrintModeEvent = { type: 'error', message: 'Test error' }
      collector.handleEvent(errorEvent)

      expect(collector.events).toHaveLength(1)
      expect(collector.errors).toHaveLength(1)
      expect(collector.errors[0]).toEqual(errorEvent)
    })
  })

  describe('handleStreamChunk', () => {
    test('collects string chunks', () => {
      collector.handleStreamChunk('Hello')
      collector.handleStreamChunk(' World')

      expect(collector.streamChunks).toHaveLength(2)
      expect(collector.streamChunks).toEqual(['Hello', ' World'])
    })

    test('collects subagent chunks', () => {
      const chunk = {
        type: 'subagent_chunk' as const,
        agentId: 'agent-123',
        agentType: 'file-picker',
        chunk: 'Processing...',
      }
      collector.handleStreamChunk(chunk)

      expect(collector.streamChunks).toHaveLength(1)
      expect(collector.streamChunks[0]).toEqual(chunk)
    })
  })

  describe('getEventsByType', () => {
    test('filters events by type', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })
      collector.handleEvent({ type: 'text', text: 'Hello' })
      collector.handleEvent({ type: 'text', text: 'World' })
      collector.handleEvent({ type: 'finish', totalCost: 0.001 })

      const textEvents = collector.getEventsByType('text')
      expect(textEvents).toHaveLength(2)
      expect(textEvents[0].text).toBe('Hello')
      expect(textEvents[1].text).toBe('World')
    })

    test('returns empty array for non-existent event type', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })

      const errorEvents = collector.getEventsByType('error')
      expect(errorEvents).toHaveLength(0)
    })
  })

  describe('hasEventType', () => {
    test('returns true when event type exists', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })

      expect(collector.hasEventType('start')).toBe(true)
    })

    test('returns false when event type does not exist', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })

      expect(collector.hasEventType('finish')).toBe(false)
    })
  })

  describe('getFirstEvent / getLastEvent', () => {
    test('getFirstEvent returns first event of type', () => {
      collector.handleEvent({ type: 'text', text: 'First' })
      collector.handleEvent({ type: 'text', text: 'Second' })

      const first = collector.getFirstEvent('text')
      expect(first?.text).toBe('First')
    })

    test('getLastEvent returns last event of type', () => {
      collector.handleEvent({ type: 'text', text: 'First' })
      collector.handleEvent({ type: 'text', text: 'Second' })

      const last = collector.getLastEvent('text')
      expect(last?.text).toBe('Second')
    })

    test('returns undefined for non-existent type', () => {
      expect(collector.getFirstEvent('error')).toBeUndefined()
      expect(collector.getLastEvent('error')).toBeUndefined()
    })
  })

  describe('getFullText', () => {
    test('concatenates all text events', () => {
      collector.handleEvent({ type: 'text', text: 'Hello' })
      collector.handleEvent({ type: 'text', text: ' ' })
      collector.handleEvent({ type: 'text', text: 'World' })

      expect(collector.getFullText()).toBe('Hello World')
    })

    test('returns empty string when no text events', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })

      expect(collector.getFullText()).toBe('')
    })
  })

  describe('getFullStreamText', () => {
    test('concatenates string chunks only', () => {
      collector.handleStreamChunk('Hello')
      collector.handleStreamChunk({
        type: 'subagent_chunk',
        agentId: 'agent-123',
        agentType: 'test',
        chunk: 'ignored',
      })
      collector.handleStreamChunk(' World')

      expect(collector.getFullStreamText()).toBe('Hello World')
    })
  })

  describe('getSubagentChunks', () => {
    test('returns chunks for specific agent', () => {
      collector.handleStreamChunk({
        type: 'subagent_chunk',
        agentId: 'agent-1',
        agentType: 'test',
        chunk: 'Chunk 1',
      })
      collector.handleStreamChunk({
        type: 'subagent_chunk',
        agentId: 'agent-2',
        agentType: 'test',
        chunk: 'Chunk 2',
      })
      collector.handleStreamChunk({
        type: 'subagent_chunk',
        agentId: 'agent-1',
        agentType: 'test',
        chunk: 'Chunk 3',
      })

      const chunks = collector.getSubagentChunks('agent-1')
      expect(chunks).toEqual(['Chunk 1', 'Chunk 3'])
    })
  })

  describe('verifyEventOrder', () => {
    test('returns true when events appear in correct order', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })
      collector.handleEvent({ type: 'text', text: 'Hello' })
      collector.handleEvent({ type: 'finish', totalCost: 0.001 })

      expect(collector.verifyEventOrder(['start', 'text', 'finish'])).toBe(true)
    })

    test('returns true for partial order check', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })
      collector.handleEvent({ type: 'text', text: 'Hello' })
      collector.handleEvent({ type: 'finish', totalCost: 0.001 })

      expect(collector.verifyEventOrder(['start', 'finish'])).toBe(true)
    })

    test('returns false when order is incorrect', () => {
      collector.handleEvent({ type: 'finish', totalCost: 0.001 })
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })

      expect(collector.verifyEventOrder(['start', 'finish'])).toBe(false)
    })

    test('returns false when event type is missing', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })

      expect(collector.verifyEventOrder(['start', 'finish'])).toBe(false)
    })
  })

  describe('getUniqueEventTypes', () => {
    test('returns set of unique event types', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })
      collector.handleEvent({ type: 'text', text: 'Hello' })
      collector.handleEvent({ type: 'text', text: 'World' })
      collector.handleEvent({ type: 'finish', totalCost: 0.001 })

      const types = collector.getUniqueEventTypes()
      expect(types.size).toBe(3)
      expect(types.has('start')).toBe(true)
      expect(types.has('text')).toBe(true)
      expect(types.has('finish')).toBe(true)
    })
  })

  describe('countEvents', () => {
    test('counts events of specific type', () => {
      collector.handleEvent({ type: 'text', text: 'One' })
      collector.handleEvent({ type: 'text', text: 'Two' })
      collector.handleEvent({ type: 'text', text: 'Three' })
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })

      expect(collector.countEvents('text')).toBe(3)
      expect(collector.countEvents('start')).toBe(1)
      expect(collector.countEvents('error')).toBe(0)
    })
  })

  describe('clear', () => {
    test('clears all collected data', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })
      collector.handleEvent({ type: 'error', message: 'Test' })
      collector.handleStreamChunk('Hello')

      collector.clear()

      expect(collector.events).toHaveLength(0)
      expect(collector.errors).toHaveLength(0)
      expect(collector.streamChunks).toHaveLength(0)
    })
  })

  describe('getSummary', () => {
    test('returns correct summary', () => {
      collector.handleEvent({ type: 'start', messageHistoryLength: 0 })
      collector.handleEvent({ type: 'text', text: 'Hello' })
      collector.handleEvent({ type: 'text', text: 'World' })
      collector.handleEvent({ type: 'finish', totalCost: 0.001 })
      collector.handleStreamChunk('Hello')
      collector.handleStreamChunk('World')

      const summary = collector.getSummary()

      expect(summary.totalEvents).toBe(4)
      expect(summary.totalChunks).toBe(2)
      expect(summary.eventTypes).toEqual({
        start: 1,
        text: 2,
        finish: 1,
      })
      expect(summary.hasErrors).toBe(false)
    })

    test('hasErrors is true when errors exist', () => {
      collector.handleEvent({ type: 'error', message: 'Test error' })

      const summary = collector.getSummary()
      expect(summary.hasErrors).toBe(true)
    })
  })
})
