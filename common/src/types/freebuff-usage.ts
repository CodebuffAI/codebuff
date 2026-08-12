/**
 * Wire types for the account hub's usage summary — the cross-surface view of
 * one account's activity, shared by the web hub, the CLI and Desktop.
 *
 * Two sources, both read on demand and nothing written ahead of time:
 * `freebuff_daily_usage` (one narrow row per active Pacific day, which already
 * exists for the streak) and a short bounded aggregate over `message`. See
 * docs/freebuff-account-hub.md.
 */

export interface FreebuffUsageStreakSummary {
  /** Days in the current run. Survives today being unused until tomorrow. */
  current: number
  /** Longest run in recorded history. */
  longest: number
  todayUsed: boolean
  lastUsageDate: string | null
}

/**
 * Token and message totals over a short recent window.
 *
 * Deliberately not all-time: the cost of aggregating `message` scales with how
 * much the account sent rather than with the calendar, so a long lookback is
 * the one shape that cannot ship. Null when the aggregate exceeded its
 * statement timeout — the UI says so rather than showing a zero.
 */
export interface FreebuffRecentUsage {
  /** Lookback in days, so the UI can label the figures honestly. */
  days: number
  messages: number
  inputTokens: number
  cacheReadTokens: number
  outputTokens: number
  /** input + cache-read + output. The one number worth showing on a tile. */
  totalTokens: number
}

export interface FreebuffUsageSessionsByModel {
  model: string
  sessions: number
  units: number
}

export interface FreebuffUsageSummary {
  timeZone: string
  /** `YYYY-MM-DD` for "today" in `timeZone`, so a client in another zone lines
   *  the activity map up with the server rather than with its own midnight. */
  todayDateKey: string
  streak: FreebuffUsageStreakSummary
  /**
   * Days the account was active inside the activity-map window, oldest first.
   * Quiet days are absent rather than listed — the renderer fills the calendar.
   */
  activeDates: string[]
  /** How many days the map window covers, ending on `todayDateKey`. */
  windowDays: number
  /** Active days over the account's whole history, not just the window. */
  allTimeActiveDays: number
  /** Null when the aggregate timed out; absent figures beat wrong ones. */
  recent: FreebuffRecentUsage | null
  /** Sessions admitted per model over the last 30 days, busiest first. */
  sessionsByModel: FreebuffUsageSessionsByModel[]
}
