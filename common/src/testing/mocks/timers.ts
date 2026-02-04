/**
 * @deprecated Use Bun's built-in mock.setSystemTime() instead.
 */

export interface PendingTimer {
  id: number
  ms: number
  fn: () => void
  active: boolean
  createdAt: number
}

export interface MockTimers {
  setTimeout: typeof globalThis.setTimeout
  clearTimeout: typeof globalThis.clearTimeout
  install: () => void
  restore: () => void
  runAll: () => void
  advanceBy: (ms: number) => void
  getPending: () => PendingTimer[]
  getPendingCount: () => number
  clearAll: () => void
  isPending: (id: number) => boolean
  getNext: () => PendingTimer | undefined
}

/** @deprecated Use Bun's built-in mock.setSystemTime() instead. */
export function createMockTimers(): MockTimers {
  const pendingTimers: PendingTimer[] = []
  let nextId = 1
  let currentTime = 0

  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout

  const mockSetTimeout = ((fn: () => void, ms?: number): number => {
    const id = nextId++
    pendingTimers.push({
      id,
      ms: Number(ms ?? 0),
      fn,
      active: true,
      createdAt: currentTime,
    })
    return id
  }) as typeof globalThis.setTimeout

  const mockClearTimeout = ((id?: number): void => {
    if (id === undefined) return
    const timer = pendingTimers.find((t) => t.id === id)
    if (timer) {
      timer.active = false
    }
  }) as typeof globalThis.clearTimeout

  const getActivePending = (): PendingTimer[] => {
    return pendingTimers.filter((t) => t.active)
  }

  return {
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,

    install(): void {
      globalThis.setTimeout = mockSetTimeout
      globalThis.clearTimeout = mockClearTimeout
    },

    restore(): void {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      pendingTimers.length = 0
      nextId = 1
      currentTime = 0
    },

    runAll(): void {
      const active = getActivePending()
      for (const timer of active) {
        if (timer.active) {
          timer.active = false
          timer.fn()
        }
      }
    },

    advanceBy(ms: number): void {
      currentTime += ms
      const active = getActivePending()
        .filter((t) => t.createdAt + t.ms <= currentTime)
        .sort((a, b) => a.createdAt + a.ms - (b.createdAt + b.ms))

      for (const timer of active) {
        if (timer.active) {
          timer.active = false
          timer.fn()
        }
      }
    },

    getPending(): PendingTimer[] {
      return getActivePending()
    },

    getPendingCount(): number {
      return getActivePending().length
    },

    clearAll(): void {
      for (const timer of pendingTimers) {
        timer.active = false
      }
    },

    isPending(id: number): boolean {
      return pendingTimers.some((t) => t.id === id && t.active)
    },

    getNext(): PendingTimer | undefined {
      return getActivePending().sort(
        (a, b) => a.createdAt + a.ms - (b.createdAt + b.ms),
      )[0]
    },
  }
}

/** @deprecated Use Bun's built-in mock.setSystemTime() instead. */
export function installMockTimers(): MockTimers {
  const timers = createMockTimers()
  timers.install()
  return timers
}
