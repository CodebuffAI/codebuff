/**
 * Event collector utility for capturing and asserting on streaming events.
 */

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

export type StreamChunk =
  | string
  | {
      type: 'subagent_chunk'
      agentId: string
      agentType: string
      chunk: string
    }
  | {
      type: 'reasoning_chunk'
      agentId: string
      ancestorRunIds: string[]
      chunk: string
    }

export class EventCollector {
  public events: PrintModeEvent[] = []
  public streamChunks: StreamChunk[] = []
  public errors: PrintModeEvent[] = []

  /** Handler function to pass to handleEvent */
  handleEvent = (event: PrintModeEvent): void => {
    this.events.push(event)
    if (event.type === 'error') {
      this.errors.push(event)
    }
  }

  /** Handler function to pass to handleStreamChunk */
  handleStreamChunk = (chunk: StreamChunk): void => {
    this.streamChunks.push(chunk)
  }

  /** Get events by type */
  getEventsByType<T extends PrintModeEvent['type']>(
    type: T,
  ): Extract<PrintModeEvent, { type: T }>[] {
    return this.events.filter(
      (e): e is Extract<PrintModeEvent, { type: T }> => e.type === type,
    )
  }

  /** Check if a specific event type was received */
  hasEventType(type: PrintModeEvent['type']): boolean {
    return this.events.some((e) => e.type === type)
  }

  /** Get the first event of a specific type */
  getFirstEvent<T extends PrintModeEvent['type']>(
    type: T,
  ): Extract<PrintModeEvent, { type: T }> | undefined {
    return this.events.find(
      (e): e is Extract<PrintModeEvent, { type: T }> => e.type === type,
    )
  }

  /** Get the last event of a specific type */
  getLastEvent<T extends PrintModeEvent['type']>(
    type: T,
  ): Extract<PrintModeEvent, { type: T }> | undefined {
    const filtered = this.getEventsByType(type)
    return filtered[filtered.length - 1]
  }

  /** Get all text content concatenated */
  getFullText(): string {
    return this.getEventsByType('text')
      .map((e) => e.text)
      .join('')
  }

  /** Get all stream chunks concatenated (strings only) */
  getFullStreamText(): string {
    return this.streamChunks
      .filter((c): c is string => typeof c === 'string')
      .join('')
  }

  /** Get subagent chunks for a specific agent */
  getSubagentChunks(agentId: string): string[] {
    return this.streamChunks
      .filter(
        (c): c is Extract<StreamChunk, { type: 'subagent_chunk' }> =>
          typeof c !== 'string' && c.type === 'subagent_chunk' && c.agentId === agentId,
      )
      .map((c) => c.chunk)
  }

  /** Check event ordering - returns true if events appear in the expected order */
  verifyEventOrder(expectedOrder: PrintModeEvent['type'][]): boolean {
    let lastIndex = -1
    for (const type of expectedOrder) {
      const index = this.events.findIndex((e, i) => i > lastIndex && e.type === type)
      if (index === -1) return false
      lastIndex = index
    }
    return true
  }

  /** Get unique event types received */
  getUniqueEventTypes(): Set<PrintModeEvent['type']> {
    return new Set(this.events.map((e) => e.type))
  }

  /** Count events of a specific type */
  countEvents(type: PrintModeEvent['type']): number {
    return this.events.filter((e) => e.type === type).length
  }

  /** Clear all collected events */
  clear(): void {
    this.events = []
    this.streamChunks = []
    this.errors = []
  }

  /** Get a summary of collected events for debugging */
  getSummary(): {
    totalEvents: number
    totalChunks: number
    eventTypes: Record<string, number>
    hasErrors: boolean
  } {
    const eventTypes: Record<string, number> = {}
    for (const event of this.events) {
      eventTypes[event.type] = (eventTypes[event.type] || 0) + 1
    }
    return {
      totalEvents: this.events.length,
      totalChunks: this.streamChunks.length,
      eventTypes,
      hasErrors: this.errors.length > 0,
    }
  }
}
