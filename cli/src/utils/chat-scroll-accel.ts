import { Queue } from './arrays'
import { clamp } from './math'

import type { ScrollAcceleration } from '@opentui/core'

const SCROLL_MODE_OVERRIDE = 'CODEBUFF_SCROLL_MODE'

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

type ScrollEnvironment =
  | {
      enabled: true
      hint?: 'zed' | 'cursor'
      override?: 'slow'
    }
  | {
      enabled: false
      hint?: undefined
      override?: 'default'
    }

const resolveScrollEnvironment = (): ScrollEnvironment => {
  const override = process.env[SCROLL_MODE_OVERRIDE]?.toLowerCase()

  if (override === 'slow' || override === 'inertial') {
    return { enabled: true, override: 'slow' }
  }
  if (override === 'default' || override === 'off') {
    return { enabled: false, override: 'default' }
  }

  const envHints = INERTIAL_HINT_VARS.flatMap((key) => {
    const value = process.env[key]
    return value ? [value.toLowerCase()] : []
  })

  const isZed = envHints.some((value) => value.includes('zed'))
  if (isZed) {
    return { enabled: true, hint: 'zed' }
  }

  const isCursor = envHints.some((value) => value.includes('cursor'))
  if (isCursor) {
    return { enabled: true, hint: 'cursor' }
  }

  return { enabled: false }
}

type QuadraticScrollAccelOptions = {
  /** How fast to scale the scrolling. */
  multiplier?: number

  /** What to cap the scrolling speed at. This will also be ommitted most likely*/
  maxRows?: number

  /** Most likely this will just be the default option. */
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

  constructor(private opts: QuadraticScrollAccelOptions = {}) {
    this.rollingWindowMs = opts.rollingWindowMs ?? 50
    this.multiplier = opts.multiplier ?? 0.3
    this.maxRows = opts.maxRows ?? Infinity
    this.tickHistory = new Queue<number>(undefined, 100)
  }

  /** Calculates the average number of scroll events */
  tick(now = Date.now()): number {
    this.tickHistory.enqueue(now)

    let oldestTick = this.tickHistory.peek() ?? now
    while (oldestTick < now - this.rollingWindowMs) {
      this.tickHistory.dequeue()
      oldestTick = this.tickHistory.peek() ?? now
    }

    return clamp(this.tickHistory.length * this.multiplier, 1, this.maxRows)
  }

  reset(): void {
    this.tickHistory.clear()
  }
}

export const createChatScrollAcceleration = ():
  | ScrollAcceleration
  | undefined => {
  const environment = resolveScrollEnvironment()

  if (!environment.enabled) {
    return new QuadraticScrollAccel()
  }
  let environmentTunedOptions: QuadraticScrollAccelOptions = {}

  if (environment.override === 'slow') {
    environmentTunedOptions.multiplier = 0.12
  } else if (environment.hint === 'zed') {
    environmentTunedOptions.multiplier = 0.015
  } else if (environment.hint === 'cursor') {
    environmentTunedOptions.multiplier = 0.055
  }

  return new QuadraticScrollAccel(environmentTunedOptions)
}
