import { Queue } from './arrays'
import { clamp } from './math'

import type { ScrollAcceleration } from '@opentui/core'

const SCROLL_MULTIPLIER = 'CODEBUFF_SCROLL_MULTIPLIER'

const ENVIRONMENT_TYPE_VARS = [
  'TERM_PROGRAM',
  'TERMINAL_EMULATOR',
  'TERM',
  'EDITOR',
  'ZED_TERM',
  'ZED_SHELL',
] as const

const ENVIRONMENTS = ['zed', 'ghostty', 'vscode'] as const

type ScrollEnvironmentType = (typeof ENVIRONMENTS)[number] | 'default'

const ENV_MULTIPLIERS = {
  zed: 1,
  ghostty: 1,
  vscode: 1,
  default: 1,
} satisfies Record<ScrollEnvironmentType, number>

type ScrollEnvironment = {
  type: ScrollEnvironmentType
  multiplier: number
}

const resolveScrollEnvironment = (): ScrollEnvironment => {
  let multiplier = parseFloat(process.env[SCROLL_MULTIPLIER] ?? '')

  if (Number.isNaN(multiplier)) {
    multiplier = 1
  }

  for (const hintVar of ENVIRONMENT_TYPE_VARS) {
    const value = process.env[hintVar]
    for (const env of ENVIRONMENTS) {
      if (value?.includes(env)) {
        return { type: env, multiplier }
      }
    }
  }

  return { type: 'default', multiplier }
}

type ConstantScrollAccelOptions = {
  /** How fast to scale the scrolling. */
  multiplier?: number
}

/** Always scrolls at a constant speed per tick. */
export class ConstantScrollAccel implements ScrollAcceleration {
  private multiplier: number
  private buffer: number

  constructor(private opts: ConstantScrollAccelOptions = {}) {
    this.buffer = 0
    this.multiplier = opts.multiplier ?? 1
  }

  tick(): number {
    this.buffer += this.multiplier
    const rows =
      this.buffer > 0 ? Math.floor(this.buffer) : Math.ceil(this.buffer)
    this.buffer -= rows
    return rows
  }

  reset(): void {
    this.buffer = 0
  }
}

type LinearScrollAccelOptions = {
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
export class LinearScrollAccel implements ScrollAcceleration {
  private rollingWindowMs: number
  private multiplier: number
  private maxRows: number
  private tickHistory: Queue<number>
  private buffer: number

  constructor(private opts: LinearScrollAccelOptions = {}) {
    this.rollingWindowMs = opts.rollingWindowMs ?? 100
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
      -this.maxRows,
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

  return new ConstantScrollAccel({
    multiplier: ENV_MULTIPLIERS[environment.type] * environment.multiplier,
  })
}
