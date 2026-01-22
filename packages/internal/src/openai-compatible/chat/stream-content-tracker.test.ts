import { describe, it, expect, beforeEach } from 'bun:test'

import { createStreamContentTracker } from './stream-content-tracker'

describe('createStreamContentTracker', () => {
  describe('processReasoningDelta', () => {
    it('should emit reasoning-start on first delta', () => {
      const tracker = createStreamContentTracker()
      const events = tracker.processReasoningDelta('thinking...')

      expect(events).toEqual([
        { type: 'reasoning-start', id: 'reasoning-0' },
        { type: 'reasoning-delta', id: 'reasoning-0', delta: 'thinking...' },
      ])
    })

    it('should not emit reasoning-start on subsequent deltas', () => {
      const tracker = createStreamContentTracker()
      
      // First delta
      tracker.processReasoningDelta('first')
      
      // Second delta
      const events = tracker.processReasoningDelta('second')

      expect(events).toEqual([
        { type: 'reasoning-delta', id: 'reasoning-0', delta: 'second' },
      ])
    })

    it('should handle empty string delta', () => {
      const tracker = createStreamContentTracker()
      const events = tracker.processReasoningDelta('')

      expect(events).toEqual([
        { type: 'reasoning-start', id: 'reasoning-0' },
        { type: 'reasoning-delta', id: 'reasoning-0', delta: '' },
      ])
    })

    it('should handle multiple consecutive deltas', () => {
      const tracker = createStreamContentTracker()
      
      const events1 = tracker.processReasoningDelta('a')
      const events2 = tracker.processReasoningDelta('b')
      const events3 = tracker.processReasoningDelta('c')

      expect(events1).toHaveLength(2) // start + delta
      expect(events2).toHaveLength(1) // delta only
      expect(events3).toHaveLength(1) // delta only
    })
  })

  describe('processTextDelta', () => {
    it('should emit text-start on first delta', () => {
      const tracker = createStreamContentTracker()
      const events = tracker.processTextDelta('Hello')

      expect(events).toEqual([
        { type: 'text-start', id: 'txt-0' },
        { type: 'text-delta', id: 'txt-0', delta: 'Hello' },
      ])
    })

    it('should not emit text-start on subsequent deltas', () => {
      const tracker = createStreamContentTracker()
      
      // First delta
      tracker.processTextDelta('first')
      
      // Second delta
      const events = tracker.processTextDelta('second')

      expect(events).toEqual([
        { type: 'text-delta', id: 'txt-0', delta: 'second' },
      ])
    })

    it('should handle empty string delta', () => {
      const tracker = createStreamContentTracker()
      const events = tracker.processTextDelta('')

      expect(events).toEqual([
        { type: 'text-start', id: 'txt-0' },
        { type: 'text-delta', id: 'txt-0', delta: '' },
      ])
    })

    it('should handle special characters and unicode', () => {
      const tracker = createStreamContentTracker()
      const events = tracker.processTextDelta('Hello 👋 world! \n\t"quotes"')

      expect(events).toEqual([
        { type: 'text-start', id: 'txt-0' },
        { type: 'text-delta', id: 'txt-0', delta: 'Hello 👋 world! \n\t"quotes"' },
      ])
    })
  })

  describe('flush', () => {
    it('should return empty array when nothing was processed', () => {
      const tracker = createStreamContentTracker()
      const events = tracker.flush()

      expect(events).toEqual([])
    })

    it('should emit reasoning-end when reasoning was active', () => {
      const tracker = createStreamContentTracker()
      tracker.processReasoningDelta('thinking')
      
      const events = tracker.flush()

      expect(events).toEqual([
        { type: 'reasoning-end', id: 'reasoning-0' },
      ])
    })

    it('should emit text-end when text was active', () => {
      const tracker = createStreamContentTracker()
      tracker.processTextDelta('hello')
      
      const events = tracker.flush()

      expect(events).toEqual([
        { type: 'text-end', id: 'txt-0' },
      ])
    })

    it('should emit both reasoning-end and text-end when both were active', () => {
      const tracker = createStreamContentTracker()
      tracker.processReasoningDelta('thinking')
      tracker.processTextDelta('hello')
      
      const events = tracker.flush()

      expect(events).toEqual([
        { type: 'reasoning-end', id: 'reasoning-0' },
        { type: 'text-end', id: 'txt-0' },
      ])
    })

    it('should emit reasoning-end before text-end', () => {
      const tracker = createStreamContentTracker()
      // Process text first, then reasoning
      tracker.processTextDelta('hello')
      tracker.processReasoningDelta('thinking')
      
      const events = tracker.flush()

      // Order should still be reasoning-end first
      expect(events[0]).toEqual({ type: 'reasoning-end', id: 'reasoning-0' })
      expect(events[1]).toEqual({ type: 'text-end', id: 'txt-0' })
    })
  })

  describe('mixed reasoning and text', () => {
    it('should handle interleaved reasoning and text deltas', () => {
      const tracker = createStreamContentTracker()
      
      const events1 = tracker.processReasoningDelta('think')
      const events2 = tracker.processTextDelta('hello')
      const events3 = tracker.processReasoningDelta('more thinking')
      const events4 = tracker.processTextDelta('world')

      // First reasoning has start
      expect(events1).toHaveLength(2)
      expect(events1[0].type).toBe('reasoning-start')

      // First text has start
      expect(events2).toHaveLength(2)
      expect(events2[0].type).toBe('text-start')

      // Subsequent deltas only have delta
      expect(events3).toHaveLength(1)
      expect(events4).toHaveLength(1)
    })

    it('should track reasoning and text independently', () => {
      const tracker = createStreamContentTracker()
      
      // Only process reasoning
      tracker.processReasoningDelta('think')
      
      const flushEvents = tracker.flush()

      // Should only have reasoning-end, not text-end
      expect(flushEvents).toEqual([
        { type: 'reasoning-end', id: 'reasoning-0' },
      ])
    })
  })
})
