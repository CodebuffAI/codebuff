import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  buildExpandedSegments,
  resolveAgentModeClick,
  OPEN_DELAY_MS,
  CLOSE_DELAY_MS,
  REOPEN_SUPPRESS_MS,
} from '../../components/agent-mode-toggle'
import { createHoverToggleControllerForTest } from '../mocks/hover-toggle-controller'

import type { AgentMode } from '../../utils/constants'

describe('AgentModeToggle - buildExpandedSegments', () => {
  const modes: AgentMode[] = ['DEFAULT', 'MAX', 'PLAN']

  for (const mode of modes) {
    test(`returns segments with active indicator for ${mode}`, () => {
      const segs = buildExpandedSegments(mode)
      // 4 mode options (DEFAULT, FREE, MAX, PLAN) + 1 active indicator
      expect(segs.length).toBe(5)

      // Current mode is disabled among the choices
      const current = segs.find((s) => s.id === mode)
      expect(current?.disabled).toBe(true)

      // Active indicator has expected id and flags
      const active = segs.find((s) => s.id === `active-${mode}`)
      expect(active).toBeTruthy()
      expect(active?.isSelected).toBe(true)
      expect(active?.defaultHighlighted).toBe(true)
    })
  }
})

describe('AgentModeToggle - resolveAgentModeClick', () => {
  test('clicking active indicator returns closeActive', () => {
    const action = resolveAgentModeClick('DEFAULT', 'active-DEFAULT', true)
    expect(action).toEqual({ type: 'closeActive' })
  })

  test('with onSelectMode provided, clicking different mode selects it', () => {
    const action = resolveAgentModeClick('DEFAULT', 'MAX', true)
    expect(action).toEqual({ type: 'selectMode', mode: 'MAX' })
  })

  test('without onSelectMode, clicking different mode toggles', () => {
    const action = resolveAgentModeClick('DEFAULT', 'PLAN', false)
    expect(action).toEqual({ type: 'toggleMode', mode: 'PLAN' })
  })
})

// Extended Date.now type with test helper method
interface MockDateNow {
  (): number
  set: (v: number) => void
}

describe('useHoverToggle timing (controller)', () => {
  let originalSetTimeout: typeof setTimeout
  let originalClearTimeout: typeof clearTimeout
  let originalNow: typeof Date.now

  let timers: { id: number; ms: number; fn: () => void; active: boolean }[]
  let nextId: number

  const runAll = () => {
    for (const t of timers) {
      if (t.active) t.fn()
    }
    timers = []
  }

  beforeEach(() => {
    timers = []
    nextId = 1
    originalSetTimeout = setTimeout
    originalClearTimeout = clearTimeout
    originalNow = Date.now

    let now = 1_000
    const mockDateNow: MockDateNow = Object.assign(
      () => now,
      { set: (v: number) => { now = v } }
    )
    Date.now = mockDateNow

    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const id = nextId++
      timers.push({ id, ms: Number(ms ?? 0), fn, active: true })
      return id as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout

    globalThis.clearTimeout = ((id?: ReturnType<typeof clearTimeout>) => {
      const rec = timers.find((t) => t.id === (id as unknown as number))
      if (rec) rec.active = false
    }) as typeof clearTimeout
  })

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    Date.now = originalNow
  })

  test('scheduleOpen waits OPEN_DELAY_MS then opens', () => {
    const ctl = createHoverToggleControllerForTest()
    expect(ctl.isOpen).toBe(false)
    ctl.scheduleOpen()
    expect(timers.length).toBe(1)
    expect(timers[0].ms).toBe(OPEN_DELAY_MS)
    runAll()
    expect(ctl.isOpen).toBe(true)
  })

  test('scheduleClose waits CLOSE_DELAY_MS then closes', () => {
    const ctl = createHoverToggleControllerForTest()
    ctl.openNow()
    expect(ctl.isOpen).toBe(true)
    ctl.scheduleClose()
    expect(timers.length).toBe(1)
    expect(timers[0].ms).toBe(CLOSE_DELAY_MS)
    runAll()
    expect(ctl.isOpen).toBe(false)
  })

  test('closeNow(true) suppresses reopen until time passes', () => {
    const ctl = createHoverToggleControllerForTest()
    ctl.closeNow(true)
    ctl.scheduleOpen()
    expect(timers.length).toBe(0)
    ;(Date.now as MockDateNow).set(1_000 + REOPEN_SUPPRESS_MS + 1)
    ctl.scheduleOpen()
    expect(timers.length).toBe(1)
    expect(timers[0].ms).toBe(OPEN_DELAY_MS)
  })
})
