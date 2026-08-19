/**
 * DeepSeek's peak pricing windows — the one definition, shared by the billing
 * code that prices a request and the product code that tells a user why their
 * allowance is smaller right now.
 *
 * It lives in `common/` because BOTH sides need it and they must never drift:
 * a ceiling reduced for "peak" that disagreed with the window billing actually
 * charged double for would be worse than no feature at all. Public-repo safe —
 * these hours are published on api-docs.deepseek.com/quick_start/pricing, and
 * nothing here reveals our pricing, our margins, or our limits.
 */

/**
 * Peak hours, from api-docs.deepseek.com/quick_start/pricing (read 2026-08-16):
 * "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC (all other hours are
 * off-peak)." Every rate doubles inside them.
 *
 * Half-open [start, end): 04:00:00 UTC itself is already off-peak. TWO
 * disjoint windows, not one — the 04:00-06:00 gap between them is exactly what
 * a single range check gets silently wrong.
 */
export const DEEPSEEK_PEAK_HOUR_RANGES_UTC: ReadonlyArray<
  readonly [number, number]
> = [
  [1, 4],
  [6, 10],
] as const

export type DeepSeekPricingWindow = 'peak' | 'off-peak'

/**
 * Which rate card applies at `at`.
 *
 * Takes the instant explicitly rather than reading the clock: the caller has to
 * decide WHICH instant (a request's completion time for billing, "now" for a
 * ceiling), and a hidden `new Date()` would make both untestable.
 */
export function deepseekPricingWindow(at: Date): DeepSeekPricingWindow {
  const hour = at.getUTCHours()
  const peak = DEEPSEEK_PEAK_HOUR_RANGES_UTC.some(
    ([startHour, endHour]) => hour >= startHour && hour < endHour,
  )
  return peak ? 'peak' : 'off-peak'
}

export function isDeepSeekPeakHour(at: Date): boolean {
  return deepseekPricingWindow(at) === 'peak'
}

/**
 * When the CURRENT window ends — the instant the rate changes.
 *
 * This is what a user is actually asking when they hit a reduced cap: not
 * "when is peak" but "when do I get my normal allowance back". Returns the
 * next boundary in either direction, so it also answers "when does the cheap
 * period end" for an off-peak caller.
 *
 * Walks hour by hour rather than computing the next range start, because the
 * windows wrap midnight and are disjoint; 24 iterations is free and cannot get
 * the wrap case wrong.
 */
export function nextDeepSeekWindowBoundary(at: Date): Date {
  const current = deepseekPricingWindow(at)
  const cursor = new Date(at)
  cursor.setUTCMinutes(0, 0, 0)
  for (let i = 1; i <= 24; i++) {
    cursor.setUTCHours(cursor.getUTCHours() + 1)
    if (deepseekPricingWindow(cursor) !== current) return new Date(cursor)
  }
  // Unreachable while both windows exist; a defined answer beats a throw on a
  // path that only ever renders a help string.
  return new Date(at.getTime() + 60 * 60 * 1000)
}

/**
 * The peak windows rendered in the READER's timezone, e.g.
 * `["6:00 PM – 9:00 PM", "11:00 PM – 3:00 AM"]`.
 *
 * Local time is the whole point of showing these at all: "01:00-04:00 UTC"
 * asks a user in Jakarta or Denver to do timezone arithmetic to find out when
 * their limits come back. `timeZone` defaults to the runtime's own zone, which
 * in a browser is the user's.
 *
 * The date component of `on` matters — a window's local clock time shifts with
 * DST — so callers pass the day they are describing rather than a fixed epoch.
 */
export function formatDeepSeekPeakWindowsLocal(
  on: Date = new Date(),
  timeZone?: string,
): string[] {
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
  const atUtcHour = (hour: number): string => {
    const d = new Date(on)
    // Hour 24 is the same instant as 00:00 the next day; setUTCHours handles
    // the rollover, which is how the 11pm-3am local window renders correctly.
    d.setUTCHours(hour, 0, 0, 0)
    return fmt.format(d)
  }
  return DEEPSEEK_PEAK_HOUR_RANGES_UTC.map(
    ([start, end]) => `${atUtcHour(start)} – ${atUtcHour(end)}`,
  )
}

// ---------------------------------------------------------------------------
// The expensive window
// ---------------------------------------------------------------------------

/**
 * How long before peak opens the window starts.
 *
 * One hour. A free session runs for an hour and keeps its model for all of it,
 * so a session admitted at 00:30 would still be generating deep into peak
 * pricing. Standing off an hour early means the sessions still running when the
 * rate doubles were never admitted in the first place.
 */
export const DEEPSEEK_EXPENSIVE_WINDOW_LEAD_HOURS = 1

/**
 * The single window in which DeepSeek is at its most expensive, [start, end)
 * UTC — 00:00 to 10:00, which is 5pm to 3am Pacific.
 *
 * DERIVED from DEEPSEEK_PEAK_HOUR_RANGES_UTC rather than written down, so it
 * cannot drift the day DeepSeek moves its hours.
 *
 * ONE window, not two, and it deliberately swallows the 04:00-06:00 off-peak
 * gap between the peaks. Reopening for a two-hour gap would admit hour-long
 * sessions that run straight into the second peak, so every session it let
 * through would be billed at double for most of its life. A gap this short is
 * cheaper to skip than to use.
 */
export const DEEPSEEK_EXPENSIVE_WINDOW_UTC: readonly [number, number] = [
  Math.min(...DEEPSEEK_PEAK_HOUR_RANGES_UTC.map(([start]) => start)) -
    DEEPSEEK_EXPENSIVE_WINDOW_LEAD_HOURS,
  Math.max(...DEEPSEEK_PEAK_HOUR_RANGES_UTC.map(([, end]) => end)),
]

/** Whether `at` falls in the window above. Half-open like the peak check, so
 *  the closing hour is already outside it. */
export function isDeepSeekExpensiveWindow(at: Date): boolean {
  const [start, end] = DEEPSEEK_EXPENSIVE_WINDOW_UTC
  const hour = at.getUTCHours()
  return hour >= start && hour < end
}

/** When the window closes — what a user is really asking when a model is
 *  unavailable. Returns `at` unchanged outside the window so callers can render
 *  "back at ..." without a second branch. */
export function deepSeekExpensiveWindowEndsAt(at: Date): Date {
  if (!isDeepSeekExpensiveWindow(at)) return new Date(at)
  const [, end] = DEEPSEEK_EXPENSIVE_WINDOW_UTC
  const ends = new Date(at)
  // The window never crosses midnight (it starts at or after 00:00 UTC), so its
  // close is always later the same UTC day.
  ends.setUTCHours(end, 0, 0, 0)
  return ends
}

/** The window in the reader's timezone, e.g. "5:00 PM – 3:00 AM". Local time is
 *  the point: a user told "00:00-10:00 UTC" has to do the arithmetic. */
export function formatDeepSeekExpensiveWindowLocal(
  on: Date = new Date(),
  timeZone?: string,
): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
  const atUtcHour = (hour: number): string => {
    const d = new Date(on)
    d.setUTCHours(hour, 0, 0, 0)
    return fmt.format(d)
  }
  const [start, end] = DEEPSEEK_EXPENSIVE_WINDOW_UTC
  return `${atUtcHour(start)} – ${atUtcHour(end)}`
}
