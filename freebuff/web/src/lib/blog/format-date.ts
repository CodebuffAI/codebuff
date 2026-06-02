/**
 * Hand-rolled date formatters used in the blog UI.
 *
 * We intentionally avoid `Intl.DateTimeFormat` / `toLocaleDateString` here.
 * Those rely on the ICU data of whichever JavaScript runtime is doing the
 * formatting, and Node.js and the browser can disagree on edge cases. That
 * disagreement shows up as a React hydration mismatch and is one of the
 * footguns called out explicitly by the Next.js docs (see
 * https://nextjs.org/docs/messages/react-hydration-error).
 *
 * Posts use ISO date strings like "2026-04-02"; we parse those manually so
 * server and client produce byte-identical output.
 */

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** "April 2, 2026". */
export function formatLongDate(iso: string): string {
  const parts = parseIso(iso)
  if (!parts) return iso
  return `${MONTHS_LONG[parts.month - 1]} ${parts.day}, ${parts.year}`
}

/** "Apr 2, 2026". */
export function formatShortDate(iso: string): string {
  const parts = parseIso(iso)
  if (!parts) return iso
  return `${MONTHS_SHORT[parts.month - 1]} ${parts.day}, ${parts.year}`
}
