import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration)

export function shortenedFromNow(time: number): string {
  const diff = dayjs.duration(Math.abs(dayjs().diff(time)))

  return shortenedDuration(diff)
}

export function simpleFromNow(time: number): string {
  const diff = dayjs.duration(Math.abs(dayjs().diff(time)))

  return durationFormat(diff)
}

export function shortenedDuration(diff: duration.Duration) {
  const units: { [key: string]: number } = {
    y: diff.years(),
    mo: diff.months(),
    d: diff.days(),
    h: diff.hours(),
    m: diff.minutes(),
    s: diff.seconds(),
  }

  for (const unit in units) {
    if (units[unit] > 0) {
      return `${units[unit]}${unit}`
    }
  }

  return '0s'
}

export function durationFormat(diff: duration.Duration) {
  const units: { [key: string]: number } = {
    years: diff.years(),
    months: diff.months(),
    days: diff.days(),
    hours: diff.hours(),
    minutes: diff.minutes(),
    seconds: diff.seconds(),
  }

  for (const unit in units) {
    if (units[unit] > 0) {
      const unitLabel = units[unit] === 1 ? unit.slice(0, -1) : unit
      return `${units[unit]} ${unitLabel}`
    }
  }

  return '0s'
}
