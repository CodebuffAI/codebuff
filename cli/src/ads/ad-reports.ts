import { toAdReport, type AdReport } from '@codebuff/common/ads/ad-report'
import { sanitizeTerminalText } from '@codebuff/common/util/terminal-safe-text'

import { reportAd } from '../utils/ad-report'

export type AdReportStatus = 'idle' | 'sending' | 'sent' | 'error'
export type ReportableAd = {
  id: number
  snapshot: AdReport
  status: AdReportStatus
  listeners: Set<() => void>
  mounted: number
}

/** Keep recent snapshots for /ads:report after a rotation or slash-menu close. */
export function createAdReportRegistry(
  send: (ad: AdReport) => Promise<void> = reportAd,
) {
  let nextId = 1
  const entries = new Map<string, ReportableAd>()
  const status = (entry: ReportableAd, value: AdReportStatus) => {
    entry.status = value
    for (const listener of entry.listeners) listener()
  }
  const register = (ad: AdReport): ReportableAd => {
    // Select and copy only report fields; no answers, prompt or targeting context.
    const snapshot = Object.freeze(toAdReport(ad))
    const key = JSON.stringify(snapshot)
    const existing = entries.get(key)
    if (existing) return existing
    const entry: ReportableAd = {
      id: nextId++,
      snapshot,
      status: 'idle',
      listeners: new Set(),
      mounted: 0,
    }
    entries.set(key, entry)
    // Mounted cards keep their keyboard target. Bound only the recent history.
    const recent = [...entries.entries()].filter(
      ([, value]) => !value.mounted && value.status !== 'sending',
    )
    for (const [oldKey] of recent.slice(0, Math.max(0, recent.length - 100)))
      entries.delete(oldKey)
    return entry
  }
  const submit = async (entry: ReportableAd): Promise<AdReportStatus> => {
    if (entry.status === 'sending' || entry.status === 'sent')
      return entry.status
    status(entry, 'sending')
    try {
      await send(entry.snapshot)
      status(entry, 'sent')
    } catch {
      status(entry, 'error')
    }
    return entry.status
  }
  const command = async (args: string): Promise<string> => {
    const input = args.trim()
    if (!input) {
      const shown = [...entries.values()].reverse().slice(0, 12)
      if (!shown.length) return 'No ads have been shown in this session.'
      return [
        'Report an ad with /ads:report <number>:',
        ...shown.map(
          (entry) =>
            `${entry.id}: ${sanitizeTerminalText(entry.snapshot.title)}${entry.status === 'sent' ? ' (reported)' : ''}`,
        ),
      ].join('\n')
    }
    const entry = /^\d+$/.test(input)
      ? [...entries.values()].find((item) => item.id === Number(input))
      : undefined
    if (!entry) return 'Ad not found. Use /ads:report to list recent ads.'
    const result = await submit(entry)
    return result === 'sent'
      ? 'Ad reported. Thank you.'
      : result === 'sending'
        ? 'Sending this ad report…'
        : `Could not send the ad report. Retry with /ads:report ${entry.id}.`
  }
  return { register, submit, command }
}

export const adReports = createAdReportRegistry()
export type AdReportRegistry = ReturnType<typeof createAdReportRegistry>
