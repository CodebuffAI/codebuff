/**
 * Cross-surface engaged-time tracker.
 *
 * The same minute-counting logic powers every product surface (cli / web / chat
 * / cloud / desktop). It is deliberately framework-agnostic and side-effect free
 * apart from a single injected `emit` callback, so each surface can wire it to
 * its own clock, scheduler, activity signal, and event-capture path:
 *
 *   - CLI:     emit = trackEvent(PRODUCT_ACTIVE_MINUTE, ...); activity = keystrokes
 *   - browser: emit = posthog.capture(...);                   activity = pointer/key/scroll + visibility
 *   - desktop: emit = posthog.capture(...) in the renderer;   activity = same as browser
 *
 * Model: a ticker fires every `intervalMs` (1 minute). Each tick emits exactly
 * one `PRODUCT_ACTIVE_MINUTE` event IFF the surface is currently "present"
 * (`setVisible(true)`) and the user has been active within `idleThresholdMs`.
 * Because one tick == one emitted event == one minute, a raw PostHog event COUNT
 * is minutes-spent — no duration math in the dashboard.
 *
 * Resilience: there is no session-end event to lose. A crash/kill drops at most
 * the in-flight minute, never a whole session.
 */

/** Heartbeat cadence. One emitted event == one minute of engaged time. */
export const ENGAGEMENT_INTERVAL_MS = 60_000

/**
 * How long after the last activity we keep counting the user as engaged. Guards
 * against a focused-but-abandoned tab / idle terminal inflating the metric, while
 * still counting normal read/think pauses between actions.
 */
export const ENGAGEMENT_IDLE_THRESHOLD_MS = 5 * 60_000

/** Minimal scheduler surface so tests (and the CLI's unref'd timers) can inject. */
export interface EngagementScheduler {
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
}

export interface EngagementTrackerOptions {
  /** Emit exactly one engaged-minute event. The surface owns event name + props. */
  emit: () => void
  /** Heartbeat cadence in ms. Defaults to {@link ENGAGEMENT_INTERVAL_MS}. */
  intervalMs?: number
  /** Idle cutoff in ms. Defaults to {@link ENGAGEMENT_IDLE_THRESHOLD_MS}. */
  idleThresholdMs?: number
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number
  /** Scheduler, injectable for tests / unref'd CLI timers. Defaults to global timers. */
  scheduler?: EngagementScheduler
}

const defaultScheduler: EngagementScheduler = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
}

export class EngagementTracker {
  private readonly emit: () => void
  private readonly intervalMs: number
  private readonly idleThresholdMs: number
  private readonly now: () => number
  private readonly scheduler: EngagementScheduler

  private lastActivity: number
  private visible = true
  private handle: unknown = undefined

  constructor(options: EngagementTrackerOptions) {
    this.emit = options.emit
    this.intervalMs = options.intervalMs ?? ENGAGEMENT_INTERVAL_MS
    this.idleThresholdMs = options.idleThresholdMs ?? ENGAGEMENT_IDLE_THRESHOLD_MS
    this.now = options.now ?? (() => Date.now())
    this.scheduler = options.scheduler ?? defaultScheduler
    this.lastActivity = this.now()
  }

  /** Record any user activity (keystroke, pointer move, scroll, etc.). Cheap. */
  recordActivity(): void {
    this.lastActivity = this.now()
  }

  /**
   * Mark whether the surface is currently present to the user — for browsers,
   * tab visible AND window focused. Re-becoming visible counts as activity so a
   * returning user is immediately re-engaged rather than waiting out the idle
   * window.
   */
  setVisible(visible: boolean): void {
    if (visible && !this.visible) {
      this.lastActivity = this.now()
    }
    this.visible = visible
  }

  /** Start the heartbeat. Idempotent. */
  start(): void {
    if (this.handle !== undefined) {
      return
    }
    this.lastActivity = this.now()
    this.handle = this.scheduler.setInterval(() => this.tick(), this.intervalMs)
  }

  /** Stop the heartbeat. Idempotent. Safe to call from exit handlers. */
  stop(): void {
    if (this.handle === undefined) {
      return
    }
    this.scheduler.clearInterval(this.handle)
    this.handle = undefined
  }

  /** Exposed for tests: returns true if this tick counted an engaged minute. */
  tick(): boolean {
    if (!this.visible) {
      return false
    }
    if (this.now() - this.lastActivity >= this.idleThresholdMs) {
      return false
    }
    this.emit()
    return true
  }
}

/** Stable per-session id so a single sitting can be counted / measured end-to-end. */
export function createEngagementSessionId(): string {
  return crypto.randomUUID()
}
