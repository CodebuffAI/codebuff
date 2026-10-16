import {
  formatWindowTimeZoneLabel,
  resolveWindowTimeZone,
} from '../constants/freebuff-peak-hours'
import type { FreebuffFreebucksInfo } from '../types/freebuff-session'
import { freebuffMultiplierText } from './freebuff-hours'
import { offPeakPriceAt, offPeakRuns } from './freebuff-price-changes'
import { getZonedYmd } from './zoned-time'

/**
 * Presentation only: prices and schedules come from the server, never the
 * private rate card.
 *
 * A FORMATTING FAILURE HERE MUST NOT REACH THE CALLER. Every call site renders
 * this inside a row map — Desktop's `HostedModelRows`, the CLI's model
 * selector, the Freebuff Web picker — so a throw does not lose a price pill,
 * it takes down whatever error boundary encloses the picker. On Desktop that
 * is the whole thread pane (transcript and composer, replaced by
 * "Something went wrong"); 11 such crashes in 24 h on 2026-10-15/16 came
 * through `getZonedParts` below, on one account, every time the user opened
 * the model picker.
 *
 * This file has already learned the lesson once a layer up: `Etc/Unknown` from
 * a device that cannot name its own zone threw out of
 * `new Intl.DateTimeFormat`, "took the whole Cloud page down to its error
 * boundary: 25 crashes in the week to 2026-09-26", and was fixed by
 * `isSupportedTimeZone`/`resolveWindowTimeZone`
 * (`constants/freebuff-peak-hours.ts:133-142`). That guard covers the zone
 * NAME; it cannot cover a runtime whose `formatToParts` does not return the
 * parts it asked for, which is what `getZonedParts` throws on.
 *
 * So the strict implementation is kept whole, below, and the export is a
 * boundary: anything it throws becomes `undefined`, which is a documented
 * answer every call site already renders (no pill, no tooltip). Deliberately
 * NOT pushed down into `getZonedParts`: its other callers are day-key and
 * accounting paths — ad rollups, the sponsored-survey one-per-day gate, the
 * free tier's monthly window, the CLI's premium reset — where a silently
 * wrong day is far worse than a throw.
 */
export function freebucksOffPeakCopy(
  info:
    | Pick<FreebuffFreebucksInfo, 'prices' | 'offPeak'>
    | null
    | undefined,
  modelId: string,
  options: { now?: number; timeZone?: string } = {},
) {
  try {
    return offPeakCopy(info, modelId, options)
  } catch {
    // A price pill is never worth a blank pane.
    return undefined
  }
}

function offPeakCopy(
  info:
    | Pick<FreebuffFreebucksInfo, 'prices' | 'offPeak'>
    | null
    | undefined,
  modelId: string,
  { now = Date.now(), timeZone }: { now?: number; timeZone?: string } = {},
) {
  const offer = info?.offPeak?.[modelId]
  if (!offer || info?.prices[modelId] === undefined) return undefined

  const { nextChangeAt, price } = offPeakPriceAt(offer, now)
  const zone = resolveWindowTimeZone(timeZone)
  // The resolved quote owns the badge too; do not run a second pricing clock.
  const active = info.prices[modelId] === offer.price
  // At peak, when the off-peak price is back, so a reader can choose to wait.
  // Only when the policy agrees it is peak: a stale quote must not promise a
  // drop at what is really the END of the off-peak window.
  const resumes =
    !active && price !== offer.price
      ? { price: offer.price, at: formatResumeAt(nextChangeAt, now, zone) }
      : undefined
  return {
    active,
    badge: active ? 'Off-peak' : 'Peak',
    resumes,
    tooltip: scheduleSentence(offer, now, zone),
  }
}

/**
 * One sentence: the EXCEPTION window — whichever price holds for fewer hours
 * a week — named, with its price as a usage multiplier (freebuff-hours.ts),
 * its hours on the reader's clock and the server's reason, then the other
 * price. Flash reads "Off-peak: 2x 3 PM–11 PM PDT, when Freebuff is quiet. 3x
 * otherwise."; fast mode reads "Peak: 10x Sun–Thu, …".
 */
function scheduleSentence(
  offer: NonNullable<FreebuffFreebucksInfo['offPeak']>[string],
  now: number,
  zone: string,
) {
  const runs = offPeakRuns(offer, now)
  const hoursOf = (offPeak: boolean) =>
    runs
      .filter((run) => run.offPeak === offPeak)
      .reduce((sum, run) => sum + run.end - run.start, 0)
  const offPeak = hoursOf(true) <= hoursOf(false)
  const exception = runs.filter((run) => run.offPeak === offPeak)
  const [first] = exception
  const [rare, usual] = offPeak
    ? [offer.price, offer.regularPrice]
    : [offer.regularPrice, offer.price]
  if (!first) return `${freebuffMultiplierText(offer.price)}.`
  const start = new Date(first.start)
  const end = new Date(first.end)
  const startZone = formatWindowTimeZoneLabel(start, zone)
  const endZone = formatWindowTimeZoneLabel(end, zone)
  const hours = `${formatTime(start, zone)}${startZone === endZone ? '' : ` ${startZone}`}–${formatTime(end, zone)} ${endZone}`
  const days = dayRange(
    exception.map((run) => new Date(run.start)),
    zone,
  )
  const reason = offer.reason ? `, ${offer.reason}` : ''
  return `${offPeak ? 'Off-peak' : 'Peak'}: ${freebuffMultiplierText(rare)} ${days ? `${days}, ` : ''}${hours}${reason}. ${freebuffMultiplierText(usual)} otherwise.`
}

/** "3 PM", or "3:30 PM" in a zone off the hour. */
function formatTime(at: Date, zone: string) {
  const minute = new Intl.DateTimeFormat('en-US', {
    minute: '2-digit',
    timeZone: zone,
  }).format(at)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    ...(Number(minute) === 0 ? {} : { minute: '2-digit' as const }),
    timeZone: zone,
  }).format(at)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The local weekdays the runs start on: "" when every day, "Sun–Thu" for a
 *  consecutive span, otherwise a list. */
function dayRange(starts: Date[], zone: string) {
  const index = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: zone,
  })
  const label = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    timeZone: zone,
  })
  const byDay = new Map<number, string>()
  for (const at of starts)
    byDay.set(WEEKDAYS.indexOf(index.format(at)), label.format(at))
  if (byDay.size >= 7) return ''
  const first = [...byDay.keys()].find((day) => !byDay.has((day + 6) % 7))!
  const span: number[] = []
  for (let day = first; byDay.has(day); day = (day + 1) % 7) span.push(day)
  if (span.length === byDay.size)
    return span.length === 1
      ? byDay.get(first)!
      : `${byDay.get(first)}–${byDay.get(span[span.length - 1]!)}`
  return [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((day) => byDay.get(day))
    .join(', ')
}

/** "3:00 AM PDT" when `at` falls on the reader's today, "Mon 3:00 AM PDT"
 *  otherwise: a peak ending after local midnight must not read as tonight. */
function formatResumeAt(at: number, now: number, zone: string) {
  const today =
    getZonedYmd(new Date(at), zone) === getZonedYmd(new Date(now), zone)
  const time = new Intl.DateTimeFormat(undefined, {
    ...(today ? {} : { weekday: 'short' as const }),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  }).format(at)
  return `${time} ${formatWindowTimeZoneLabel(new Date(at), zone)}`
}
