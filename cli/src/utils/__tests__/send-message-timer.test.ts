import { describe, expect, test, mock } from 'bun:test'

import { createSendMessageTimerController } from '../send-message-timer'

describe('createSendMessageTimerController', () => {
  test('emits start and stop events with elapsed time', () => {
    let nowValue = 1000
    const events: any[] = []
    const mainAgentTimer = {
      start: mock(() => {}),
      stop: mock(() => {}),
    }

    const controller = createSendMessageTimerController({
      mainAgentTimer: mainAgentTimer as any,
      onTimerEvent: (event) => events.push(event),
      now: () => nowValue,
    })

    controller.start('msg-1')
    nowValue = 1600
    const result = controller.stop('success')

    expect(result?.elapsedMs).toBe(600)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'start', messageId: 'msg-1' })
    expect(events[1]).toMatchObject({
      type: 'stop',
      messageId: 'msg-1',
      elapsedMs: 600,
      outcome: 'success',
    })
  })

  test('ignores repeated starts and tracks active state', () => {
    let nowValue = 0
    const mainAgentTimer = {
      start: mock(() => {}),
      stop: mock(() => {}),
    }

    const controller = createSendMessageTimerController({
      mainAgentTimer: mainAgentTimer as any,
      onTimerEvent: () => {},
      now: () => nowValue,
    })

    controller.start('msg-1')
    controller.start('msg-1')

    expect(mainAgentTimer.start).toHaveBeenCalledTimes(1)
    expect(controller.isActive()).toBe(true)

    nowValue = 25
    controller.stop('error')
    expect(controller.isActive()).toBe(false)
  })
})
