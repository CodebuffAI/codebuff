import { describe, test, expect, beforeEach, mock } from 'bun:test'

import {
  createSendMessageTimerController,
  type SendMessageTimerEvent,
  type SendMessageTimerOutcome,
} from '../../utils/send-message-timer'

import type { ElapsedTimeTracker } from '../use-elapsed-time'

describe('createSendMessageTimerController', () => {
  let mainAgentTimer: ElapsedTimeTracker
  let timerEvents: SendMessageTimerEvent[]
  let startMock: ReturnType<typeof mock>
  let stopMock: ReturnType<typeof mock>
  let nowValues: number[]

  const createController = (agentId?: string, nowOverride?: () => number) =>
    createSendMessageTimerController({
      mainAgentTimer,
      agentId,
      onTimerEvent: (event) => timerEvents.push(event),
      now: nowOverride ?? (() => Date.now()),
    })

  beforeEach(() => {
    timerEvents = []
    nowValues = []
    startMock = mock(() => {})
    stopMock = mock(() => {})
    mainAgentTimer = {
      start: startMock,
      stop: stopMock,
      elapsedSeconds: 0,
      startTime: null,
    }
  })

  const nextNow = () => {
    if (nowValues.length === 0) {
      throw new Error('No mock time available')
    }
    return nowValues.shift()!
  }

  test('emits start and stop events with elapsed time', () => {
    nowValues = [1_000, 1_640]
    const controller = createController('assistant', nextNow)

    controller.start('ai-123')
    const result = controller.stop('success')

    expect(result?.elapsedMs).toBe(640)
    expect(result?.finishedAt).toBe(1_640)
    expect(startMock.mock.calls.length).toBe(1)
    expect(stopMock.mock.calls.length).toBe(1)
    expect(timerEvents.map((event) => event.type)).toEqual(['start', 'stop'])

    const startEvent = timerEvents[0] as Extract<
      SendMessageTimerEvent,
      { type: 'start' }
    >
    const stopEvent = timerEvents[1] as Extract<
      SendMessageTimerEvent,
      { type: 'stop' }
    >

    expect(startEvent.startedAt).toBe(1_000)
    expect(startEvent.agentId).toBe('assistant')
    expect(startEvent.messageId).toBe('ai-123')

    expect(stopEvent.startedAt).toBe(1_000)
    expect(stopEvent.finishedAt).toBe(1_640)
    expect(stopEvent.elapsedMs).toBe(640)
    expect(stopEvent.outcome).toBe('success')
    expect(stopEvent.agentId).toBe('assistant')
    expect(stopEvent.messageId).toBe('ai-123')
  })

  test('start is idempotent until stop is called', () => {
    const controller = createController(undefined, nextNow)
    nowValues = [100]

    controller.start('ai-1')
    controller.start('ai-2') // should be ignored

    expect(startMock.mock.calls.length).toBe(1)
    expect(timerEvents).toHaveLength(1)
    expect(
      (timerEvents[0] as Extract<SendMessageTimerEvent, { type: 'start' }>)
        .messageId,
    ).toBe('ai-1')
  })

  test('stop returns null when timer was never started', () => {
    const controller = createController()

    const result = controller.stop('error')

    expect(result).toBeNull()
    expect(stopMock.mock.calls.length).toBe(0)
    expect(timerEvents).toHaveLength(0)
  })

  test('records outcome-specific stop events', () => {
    const outcomes: SendMessageTimerOutcome[] = ['success', 'error', 'aborted']
    nowValues = [10, 20, 30, 40, 50, 60]
    const controller = createController('assistant', nextNow)

    for (const outcome of outcomes) {
      controller.start(`ai-${outcome}`)
      controller.stop(outcome)
    }

    const stopEvents = timerEvents.filter(
      (event): event is Extract<SendMessageTimerEvent, { type: 'stop' }> =>
        event.type === 'stop',
    )

    expect(stopEvents).toHaveLength(3)
    expect(stopEvents.map((event) => event.outcome)).toEqual(outcomes)
    expect(startMock.mock.calls.length).toBe(3)
    expect(stopMock.mock.calls.length).toBe(3)
  })

  test('allows restarting after stop', () => {
    nowValues = [1, 2, 3, 7]
    const controller = createController(undefined, nextNow)

    controller.start('ai-1')
    controller.stop('success')
    controller.start('ai-2')
    const result = controller.stop('success')

    expect(result?.elapsedMs).toBe(4)
    const stopEvents = timerEvents.filter(
      (event): event is Extract<SendMessageTimerEvent, { type: 'stop' }> =>
        event.type === 'stop',
    )
    expect(stopEvents).toHaveLength(2)
    expect(stopEvents[1].messageId).toBe('ai-2')
  })
})
