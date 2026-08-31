import { afterEach, describe, expect, test } from 'bun:test'

import {
  __resetSteeringForTests,
  activateSteering,
  deactivateSteering,
  drainSteeringMessages,
  isSteeringActive,
  pushSteeringMessage,
} from '../steering-buffer'

const entry = (text: string, messageId = `msg-${text}`) => ({
  messageId,
  text,
})

afterEach(() => {
  __resetSteeringForTests()
})

describe('steering buffer', () => {
  test('push fails while no run is active', () => {
    expect(isSteeringActive()).toBe(false)
    expect(pushSteeringMessage(entry('hello'))).toBe(false)
  })

  test('push/drain round-trips in order while a run is active', () => {
    activateSteering('run-1')
    expect(isSteeringActive()).toBe(true)
    expect(pushSteeringMessage(entry('first'))).toBe(true)
    expect(pushSteeringMessage(entry('second'))).toBe(true)
    expect(drainSteeringMessages('run-1')).toEqual([
      entry('first'),
      entry('second'),
    ])
    // Drained means gone.
    expect(drainSteeringMessages('run-1')).toEqual([])
  })

  test('drain is owner-guarded', () => {
    activateSteering('run-1')
    pushSteeringMessage(entry('for run 1'))
    expect(drainSteeringMessages('run-2')).toEqual([])
    expect(drainSteeringMessages('run-1')).toEqual([entry('for run 1')])
  })

  test('deactivate returns undelivered leftovers exactly once', () => {
    activateSteering('run-1')
    pushSteeringMessage(entry('too late'))
    expect(deactivateSteering('run-1')).toEqual([entry('too late')])
    expect(deactivateSteering('run-1')).toEqual([])
    expect(pushSteeringMessage(entry('after end'))).toBe(false)
  })

  test('a stale run cannot deactivate a newer run', () => {
    activateSteering('run-1')
    activateSteering('run-2')
    pushSteeringMessage(entry('for run 2'))
    expect(deactivateSteering('run-1')).toEqual([])
    expect(drainSteeringMessages('run-2')).toEqual([entry('for run 2')])
  })

  test('activation clears residue from a run that never deactivated', () => {
    activateSteering('run-1')
    pushSteeringMessage(entry('stale'))
    activateSteering('run-2')
    expect(drainSteeringMessages('run-2')).toEqual([])
  })
})
