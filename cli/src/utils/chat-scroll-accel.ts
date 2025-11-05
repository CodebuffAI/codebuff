import { Queue } from './arrays'
import { clamp } from './math'

import type { ScrollAcceleration } from '@opentui/core'

const SCROLL_MULTIPLIER = 'CODEBUFF_SCROLL_MULTIPLIER'

const INERTIAL_HINT_VARS = [
  'TERM_PROGRAM',
  'TERMINAL_EMULATOR',
  'TERM',
  'EDITOR',
  'ZED_TERM',
  'ZED_SHELL',
  'CURSOR',
  'CURSOR_TERM',
  'CURSOR_TERMINAL',
] as const

const ENVIRONMENTS = ['zed', 'cursor', 'ghostty', 'vscode'] as const

type ScrollEnvironment =
  | {
      enabled: true
      hint?: (typeof ENVIRONMENTS)[number]
      override?: 'slow' | 'fast'
    }
  | {
      enabled: false
      hint?: undefined
      override?: 'default'
    }

const resolveScrollEnvironment = (): ScrollEnvironment => {
  const override = process.env[SCROLL_MULTIPLIER]?.toLowerCase()

  if (override === 'slow') {
    return { enabled: true, override: 'slow' }
  }
  if (override === 'default' || override === 'off') {
    return { enabled: false, override: 'default' }
  }
  if (override === 'fast') {
    return { enabled: true, override: 'fast' }
  }

  for (const hintVar of INERTIAL_HINT_VARS) {
    const value = process.env[hintVar]
    for (const env of ENVIRONMENTS) {
      if (value?.includes(env)) {
        return { enabled: true, hint: env }
      }
    }
  }

  return { enabled: false }
}

const ENV_MULTIPLIERS = {
  zed: 0.015,
  cursor: 0.055,
  ghostty: 0.3,
  vscode: 0.3,
  default: 0.3,
} satisfies Record<(typeof ENVIRONMENTS)[number] | 'default', number>

type LinearScrollAccelOptions = {
  /** How fast to scale the scrolling. */
  multiplier?: number
}

/** Always scrolls at a constant speed per tick. */
export class LinearScrollAccel implements ScrollAcceleration {
  private multiplier: number
  private buffer: number

  constructor(private opts: LinearScrollAccelOptions = {}) {
    this.buffer = 0
    this.multiplier = opts.multiplier ?? 1
  }

  tick(): number {
    this.buffer += this.multiplier
    const rows = Math.floor(this.buffer)
    this.buffer -= rows
    return rows
  }

  reset(): void {
    this.buffer = 0
  }
}

type QuadraticScrollAccelOptions = {
  /** How fast to scale the scrolling. */
  multiplier?: number

  /** What to cap the scrolling speed at.
   *
   * This will most likely be ommitted.
   */
  maxRows?: number

  /** How long to look back for scroll events.
   *
   * This will most likely be omitted.
   */
  rollingWindowMs?: number
}

/** Estimates the scrolling speed based on the frequency of scroll events.
 *
 * The number of lines scrolled is proportional to the number of scroll events
 * in the last `rollingWindowMs`.
 */
export class QuadraticScrollAccel implements ScrollAcceleration {
  private rollingWindowMs: number
  private multiplier: number
  private maxRows: number
  private tickHistory: Queue<number>
  private buffer: number

  constructor(private opts: QuadraticScrollAccelOptions = {}) {
    this.rollingWindowMs = opts.rollingWindowMs ?? 50
    this.multiplier = opts.multiplier ?? 0.3
    this.maxRows = opts.maxRows ?? Infinity
    this.tickHistory = new Queue<number>(undefined, 100)
    this.buffer = 0
  }

  /** Calculates the average number of scroll events */
  tick(now = Date.now()): number {
    this.tickHistory.enqueue(now)

    let oldestTick = this.tickHistory.peek() ?? now
    while (oldestTick < now - this.rollingWindowMs) {
      this.tickHistory.dequeue()
      oldestTick = this.tickHistory.peek() ?? now
    }

    this.buffer += clamp(
      this.tickHistory.length * this.multiplier,
      0,
      this.maxRows,
    )
    const rows = Math.floor(this.buffer)
    this.buffer -= rows
    return rows
  }

  reset(): void {
    this.tickHistory.clear()
    this.buffer = 0
  }
}

export const createChatScrollAcceleration = (): ScrollAcceleration => {
  const environment = resolveScrollEnvironment()

  let environmentTunedOptions: { multiplier?: number } = {}

  if (!environment.enabled) {
    // No environment detected
    environmentTunedOptions.multiplier = ENV_MULTIPLIERS.default
  } else {
    environmentTunedOptions.multiplier =
      ENV_MULTIPLIERS[environment.hint ?? 'default']
    if (environment.override === 'slow') {
      environmentTunedOptions.multiplier *= 0.5
    }
    if (environment.override === 'fast') {
      environmentTunedOptions.multiplier *= 2
    }
  }

  return new QuadraticScrollAccel(environmentTunedOptions)
}
