import { describe, test, expect, beforeEach } from 'bun:test'

import { useMessageBlockStore } from '../message-block-store'

describe('MessageBlockStore equality guards', () => {
  beforeEach(() => {
    useMessageBlockStore.getState().reset()
  })

  test('notifies subscribers when context property actually changes', () => {
    let notifications = 0
    const unsub = useMessageBlockStore.subscribe(() => {
      notifications++
    })

    useMessageBlockStore.getState().setContext({ availableWidth: 120 })
    expect(notifications).toBe(1)
    expect(useMessageBlockStore.getState().context.availableWidth).toBe(120)

    unsub()
  })

  test('does NOT notify subscribers when setContext is called with identical values', () => {
    let notifications = 0
    const unsub = useMessageBlockStore.subscribe(() => {
      notifications++
    })

    // availableWidth is already 80 in initialContext
    useMessageBlockStore.getState().setContext({ availableWidth: 80 })
    expect(notifications).toBe(0)

    // Call with existing isWaitingForResponse: false
    useMessageBlockStore.getState().setContext({ isWaitingForResponse: false })
    expect(notifications).toBe(0)

    unsub()
  })

  test('does NOT notify subscribers when setCallbacks is called with identical callbacks', () => {
    let notifications = 0
    const currentCallbacks = useMessageBlockStore.getState().callbacks

    const unsub = useMessageBlockStore.subscribe(() => {
      notifications++
    })

    // Passing identical callbacks reference dictionary
    useMessageBlockStore.getState().setCallbacks({ ...currentCallbacks })
    expect(notifications).toBe(0)

    // Modifying one callback triggers notification
    const newFn = () => {}
    useMessageBlockStore.getState().setCallbacks({
      ...currentCallbacks,
      onBuildFast: newFn,
    })
    expect(notifications).toBe(1)
    expect(useMessageBlockStore.getState().callbacks.onBuildFast).toBe(newFn)

    unsub()
  })
})
