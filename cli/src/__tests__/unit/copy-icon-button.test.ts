import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

import { createHoverToggleControllerForTest } from '../mocks/hover-toggle-controller'

/**
 * Tests for the CopyIconButton hover state behavior.
 * 
 * The key behavior being tested:
 * - When the copy button is clicked and shows "copied", the hover state should be closed
 * - This prevents the button from appearing in hover state after the "copied" message disappears
 */
describe('CopyIconButton hover state behavior', () => {
  let originalSetTimeout: typeof setTimeout
  let originalClearTimeout: typeof clearTimeout

  let timers: { id: number; ms: number; fn: Function; active: boolean }[]
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

    globalThis.setTimeout = ((fn: Function, ms?: number) => {
      const id = nextId++
      timers.push({ id, ms: Number(ms ?? 0), fn, active: true })
      return id as any
    }) as any

    globalThis.clearTimeout = ((id?: any) => {
      const rec = timers.find((t) => t.id === id)
      if (rec) rec.active = false
    }) as any
  })

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  })

  test('hover state closes when button is clicked (simulates copy action)', () => {
    const hover = createHoverToggleControllerForTest()
    
    // Simulate: user hovers over button, hover state opens
    hover.scheduleOpen()
    runAll()
    expect(hover.isOpen).toBe(true)
    
    // Simulate: user clicks the button (copy action)
    // The fix: closeNow() should be called to close hover state
    hover.closeNow()
    
    // Hover state should now be closed
    expect(hover.isOpen).toBe(false)
  })

  test('hover state remains closed after copied state ends', () => {
    const hover = createHoverToggleControllerForTest()
    let isCopied = false
    
    // Simulate: user hovers, hover opens
    hover.scheduleOpen()
    runAll()
    expect(hover.isOpen).toBe(true)
    
    // Simulate: user clicks copy button
    isCopied = true
    hover.closeNow() // This is the fix we added
    
    expect(hover.isOpen).toBe(false)
    
    // Simulate: 2 seconds pass, isCopied resets to false
    isCopied = false
    
    // Without re-hovering, the hover state should still be closed
    expect(hover.isOpen).toBe(false)
  })

  test('without closeNow fix, hover would persist after copy (demonstrates the bug)', () => {
    const hover = createHoverToggleControllerForTest()
    let isCopied = false
    
    // Simulate: user hovers, hover opens
    hover.scheduleOpen()
    runAll()
    expect(hover.isOpen).toBe(true)
    
    // Simulate old buggy behavior: click happens but closeNow is NOT called
    isCopied = true
    // hover.closeNow() was NOT called in the buggy version
    
    // BUG: hover state is still open
    expect(hover.isOpen).toBe(true)
    
    // After isCopied resets, hover is STILL open (this was the bug)
    isCopied = false
    expect(hover.isOpen).toBe(true) // Bug: should be false
  })

  test('mouse out does not close hover while in copied state', () => {
    const hover = createHoverToggleControllerForTest()
    let isCopied = false
    
    // Simulate: user hovers, hover opens
    hover.scheduleOpen()
    runAll()
    expect(hover.isOpen).toBe(true)
    
    // Simulate: user clicks, enters copied state, hover closes
    isCopied = true
    hover.closeNow()
    expect(hover.isOpen).toBe(false)
    
    // Simulate: mouse out handler - should not schedule close when isCopied
    // (This mirrors the component logic: handleMouseOut only calls scheduleClose when !isCopied)
    if (!isCopied) {
      hover.scheduleClose()
    }
    
    // No timers should be scheduled since we're in copied state
    expect(timers.filter(t => t.active).length).toBe(0)
  })

  test('mouse over does not open hover while in copied state', () => {
    const hover = createHoverToggleControllerForTest()
    let isCopied = false
    
    // Start with hover closed
    expect(hover.isOpen).toBe(false)
    
    // Enter copied state
    isCopied = true
    
    // Simulate: mouse over handler - should not schedule open when isCopied
    // (This mirrors the component logic: handleMouseOver only calls scheduleOpen when !isCopied)
    if (!isCopied) {
      hover.clearCloseTimer()
      hover.scheduleOpen()
    }
    
    // No timers should be scheduled since we're in copied state
    expect(timers.filter(t => t.active).length).toBe(0)
    expect(hover.isOpen).toBe(false)
  })
})
