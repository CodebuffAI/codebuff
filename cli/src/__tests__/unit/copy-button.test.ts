import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  getCopyIconText,
  copyButtonHandlers,
  COPIED_RESET_DELAY_MS,
  COPY_ICON_COLLAPSED,
  COPY_ICON_EXPANDED,
  COPY_ICON_COPIED,
} from '../../components/copy-button'
import { initializeThemeStore } from '../../hooks/use-theme'

// Initialize theme before tests
initializeThemeStore()

/**
 * Tests for CopyButton component logic.
 *
 * These tests use the exported utilities from copy-button.tsx:
 * - getCopyIconText: determines what text to display
 * - copyButtonHandlers: pure functions for state transitions
 * - COPIED_RESET_DELAY_MS: the timeout constant
 */

describe('CopyButton - CopyIcon text rendering', () => {
  describe('with leadingSpace=true (default)', () => {
    test('renders collapsed icon when not hovered or copied', () => {
      const text = getCopyIconText(false, false, true)
      expect(text).toBe(' ⎘')
    })

    test('renders expanded text when hovered', () => {
      const text = getCopyIconText(false, true, true)
      expect(text).toBe(' [⎘ copy]')
    })

    test('renders copied text when copied', () => {
      const text = getCopyIconText(true, false, true)
      expect(text).toBe(' [✔ copied]')
    })

    test('renders copied text even when hovered (copied takes priority)', () => {
      const text = getCopyIconText(true, true, true)
      expect(text).toBe(' [✔ copied]')
    })
  })

  describe('with leadingSpace=false', () => {
    test('renders collapsed icon without leading space', () => {
      const text = getCopyIconText(false, false, false)
      expect(text).toBe('⎘')
    })

    test('renders expanded text without leading space', () => {
      const text = getCopyIconText(false, true, false)
      expect(text).toBe('[⎘ copy]')
    })

    test('renders copied text without leading space', () => {
      const text = getCopyIconText(true, false, false)
      expect(text).toBe('[✔ copied]')
    })
  })
})

describe('CopyButton - copyButtonHandlers (from component)', () => {
  describe('handleMouseOver', () => {
    test('returns true (should hover) when not copied', () => {
      expect(copyButtonHandlers.handleMouseOver(false)).toBe(true)
    })

    test('returns false (block hover) when copied', () => {
      expect(copyButtonHandlers.handleMouseOver(true)).toBe(false)
    })
  })

  describe('handleMouseOut', () => {
    test('always returns false to clear hover', () => {
      expect(copyButtonHandlers.handleMouseOut()).toBe(false)
    })
  })

  describe('handleCopy', () => {
    test('returns copied=true and clears hover', () => {
      const result = copyButtonHandlers.handleCopy()
      expect(result).toEqual({ isCopied: true, isHovered: false })
    })
  })
})

describe('CopyButton - exported constants', () => {
  test('COPIED_RESET_DELAY_MS is 2000ms', () => {
    expect(COPIED_RESET_DELAY_MS).toBe(2000)
  })

  test('icon constants are defined', () => {
    expect(COPY_ICON_COLLAPSED).toBe('⎘')
    expect(COPY_ICON_EXPANDED).toBe('[⎘ copy]')
    expect(COPY_ICON_COPIED).toBe('[✔ copied]')
  })
})

describe('CopyButton - copied state reset timing', () => {
  let originalSetTimeout: typeof setTimeout
  let originalClearTimeout: typeof clearTimeout
  let timers: { id: number; ms: number; fn: Function; active: boolean }[]
  let nextId: number

  const runTimers = () => {
    for (const t of timers) {
      if (t.active) t.fn()
    }
    timers = []
  }

  beforeEach(() => {
    timers = []
    nextId = 1
    originalSetTimeout = globalThis.setTimeout
    originalClearTimeout = globalThis.clearTimeout

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

  test('uses the exported COPIED_RESET_DELAY_MS constant (2000ms)', () => {
    let isCopied = false

    // Simulate handleCopy using the exported constant
    const handleCopy = () => {
      const newState = copyButtonHandlers.handleCopy()
      isCopied = newState.isCopied
      setTimeout(() => {
        isCopied = false
      }, COPIED_RESET_DELAY_MS)
    }

    handleCopy()
    expect(isCopied).toBe(true)
    expect(timers.length).toBe(1)
    expect(timers[0].ms).toBe(COPIED_RESET_DELAY_MS)

    runTimers()
    expect(isCopied).toBe(false)
  })

  test('multiple rapid clicks only create one active timer', () => {
    let isCopied = false
    let currentTimerId: number | null = null

    const handleCopy = () => {
      if (currentTimerId !== null) {
        clearTimeout(currentTimerId)
      }
      const newState = copyButtonHandlers.handleCopy()
      isCopied = newState.isCopied
      currentTimerId = setTimeout(() => {
        isCopied = false
      }, COPIED_RESET_DELAY_MS) as unknown as number
    }

    handleCopy()
    handleCopy()
    handleCopy()

    const activeTimers = timers.filter((t) => t.active)
    expect(activeTimers.length).toBe(1)
  })
})

