import { MacOSScrollAccel, LinearScrollAccel } from '@opentui/core'

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

type InertialOptions = {
  baseMultiplier?: number
  minMultiplier?: number
  maxMultiplier?: number
  inertiaDecayMs?: number
  impulseWindowMs?: number
  impulseCutoffMs?: number
  gentleWindowMs?: number
  idleResetMs?: number
  impulseStrength?: number
  maxMomentum?: number
  baseDamp?: number
  gentleMomentumDecay?: number
  impulseStackExponent?: number
  momentumBoostFactor?: number
}

const DEFAULT_OPTIONS: Required<InertialOptions> = {
  baseMultiplier: 0.08,
  minMultiplier: 0.012,
  maxMultiplier: 2.2,
  inertiaDecayMs: 340,
  impulseWindowMs: 110,
  impulseCutoffMs: 460,
  gentleWindowMs: 220,
  idleResetMs: 480,
  impulseStrength: 0.7,
  maxMomentum: 1.8,
  baseDamp: 0.02,
  gentleMomentumDecay: 2.25,
  impulseStackExponent: 1.25,
  momentumBoostFactor: 1.15,
}

class InertialScrollAccel implements ScrollAcceleration {
  private lastTickTime = 0
  private momentum = 0
  private readonly directionMomentum = { up: 0, down: 0, left: 0, right: 0 }

  constructor(
    private readonly base: ScrollAcceleration,
    private readonly options: Required<InertialOptions>,
  ) {}

  tick(
    now = Date.now(),
    direction: 'up' | 'down' | 'left' | 'right' = 'down',
  ): number {
    const {
      baseMultiplier,
      minMultiplier,
      maxMultiplier,
      inertiaDecayMs,
      impulseWindowMs,
      impulseCutoffMs,
      gentleWindowMs,
      idleResetMs,
      impulseStrength,
      maxMomentum,
      baseDamp,
      gentleMomentumDecay,
      impulseStackExponent,
      momentumBoostFactor,
    } = this.options

    const baseValue = this.base.tick(now)

    const dt = this.lastTickTime
      ? now - this.lastTickTime
      : Number.POSITIVE_INFINITY
    this.lastTickTime = now

    if (dt === Number.POSITIVE_INFINITY || dt > idleResetMs) {
      this.momentum = 0
      this.directionMomentum[direction] = 0
    } else {
      const decay = Math.exp(-dt / inertiaDecayMs)
      const decayPower = dt > impulseWindowMs ? gentleMomentumDecay : 1
      this.momentum *= Math.pow(decay, decayPower)
      this.directionMomentum[direction] *= Math.pow(decay, decayPower)

      const cutoff = Math.max(impulseCutoffMs, impulseWindowMs)
      if (cutoff > 0 && dt < cutoff) {
        const normalized = Math.max(0, (cutoff - dt) / cutoff)
        const intensity =
          dt <= impulseWindowMs
            ? Math.pow(normalized, 0.45)
            : Math.pow(normalized, 1.15)
        if (intensity > 0) {
          const stacked = Math.pow(
            this.directionMomentum[direction] + intensity * impulseStrength,
            impulseStackExponent,
          )
          this.directionMomentum[direction] = clamp(
            stacked,
            0,
            maxMomentum * momentumBoostFactor,
          )
          this.momentum += intensity * impulseStrength
        }
      }

      this.momentum = clamp(this.momentum, 0, maxMomentum)
      this.directionMomentum[direction] = clamp(
        this.directionMomentum[direction],
        0,
        maxMomentum * momentumBoostFactor,
      )
    }

    let baseContribution = clamp(
      baseValue * baseMultiplier,
      minMultiplier,
      maxMultiplier,
    )

    if (dt === Number.POSITIVE_INFINITY) {
      baseContribution = minMultiplier
    } else if (gentleWindowMs > 0 && dt > gentleWindowMs) {
      const ratio = gentleWindowMs / dt
      const gentleFactor = Math.pow(Math.max(ratio, 0), 1.6)
      baseContribution = clamp(
        baseContribution * gentleFactor,
        minMultiplier,
        maxMultiplier,
      )
    }

    const directionalBoost = this.directionMomentum[direction] * 0.65
    const blended = clamp(
      baseContribution + this.momentum + directionalBoost,
      minMultiplier,
      maxMultiplier,
    )
    return Math.max(blended - baseDamp, minMultiplier)
  }

  reset(): void {
    this.base.reset()
    this.lastTickTime = 0
    this.momentum = 0
    this.directionMomentum.up = 0
    this.directionMomentum.down = 0
    this.directionMomentum.left = 0
    this.directionMomentum.right = 0
  }
}

let previousTime = Date.now()
export class QuadraticScrollAccel implements ScrollAcceleration {
  private rollingWindowMs: number
  private multiplier: number
  private maxRows: number
  private tickHistory: Queue<number>

  constructor(
    private opts: {
      rollingWindowMs?: number
      multiplier?: number
      maxRows?: number
    } = {},
  ) {
    this.rollingWindowMs = opts.rollingWindowMs ?? 50
    this.multiplier = opts.multiplier ?? 0.5
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

    const dt = now - previousTime
    previousTime = now
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

  const base =
    process.platform === 'darwin'
      ? new MacOSScrollAccel({ A: 0.5, tau: 3, maxMultiplier: 4 })
      : new LinearScrollAccel()

  const platformTunedOptions: InertialOptions =
    process.platform === 'darwin'
      ? {
          baseMultiplier: 0.035,
          impulseStrength: 0.5,
          maxMomentum: 1.4,
          baseDamp: 0.02,
        }
      : {
          baseMultiplier: 0.1,
          impulseStrength: 0.75,
          maxMomentum: 2,
        }

  let environmentTunedOptions: InertialOptions = {}

  if (environment.override === 'slow') {
    environmentTunedOptions = {
      baseMultiplier: 0.12,
      maxMomentum: 2.4,
      impulseStrength: 0.9,
      baseDamp: 0.015,
    }
  } else if (environment.hint === 'zed') {
    environmentTunedOptions = {
      baseMultiplier: 0.015,
      minMultiplier: 0.006,
      maxMultiplier: 1.45,
      inertiaDecayMs: 380,
      impulseWindowMs: 90,
      impulseCutoffMs: 320,
      gentleWindowMs: 280,
      impulseStrength: 0.34,
      maxMomentum: 0.9,
      baseDamp: 0.03,
      gentleMomentumDecay: 3.8,
      impulseStackExponent: 1.35,
      momentumBoostFactor: 1.45,
    }
  } else if (environment.hint === 'cursor') {
    environmentTunedOptions = {
      baseMultiplier: 0.055,
      maxMomentum: 1.6,
      impulseStrength: 0.58,
      baseDamp: 0.024,
    }
  }

  const options = {
    ...DEFAULT_OPTIONS,
    ...platformTunedOptions,
    ...environmentTunedOptions,
  }

  return new InertialScrollAccel(base, options)
}
