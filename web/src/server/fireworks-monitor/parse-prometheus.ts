import type { PromMetrics, PromSample } from './types'

const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(.+)$/

export function parsePrometheusText(text: string, now: number = Date.now()): PromMetrics {
  const samples: PromSample[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const match = LINE_RE.exec(line)
    if (!match) continue

    const name = match[1]
    const labelBlob = match[3] ?? ''
    const valueStr = match[4].trim()

    const value = parsePromValue(valueStr)
    if (value === null) continue

    samples.push({
      name,
      labels: parseLabels(labelBlob),
      value,
    })
  }

  return { samples, scrapedAt: now }
}

function parsePromValue(raw: string): number | null {
  const trimmed = raw.split(/\s+/)[0]
  if (trimmed === 'NaN') return NaN
  if (trimmed === '+Inf') return Number.POSITIVE_INFINITY
  if (trimmed === '-Inf') return Number.NEGATIVE_INFINITY
  const n = Number(trimmed)
  return Number.isFinite(n) || Number.isNaN(n) ? n : null
}

function parseLabels(blob: string): Record<string, string> {
  const labels: Record<string, string> = {}
  if (blob === '') return labels

  let i = 0
  while (i < blob.length) {
    while (i < blob.length && (blob[i] === ' ' || blob[i] === ',')) i++
    if (i >= blob.length) break

    const eq = blob.indexOf('=', i)
    if (eq === -1) break
    const key = blob.slice(i, eq).trim()

    let j = eq + 1
    if (blob[j] !== '"') break
    j++
    let value = ''
    while (j < blob.length && blob[j] !== '"') {
      if (blob[j] === '\\' && j + 1 < blob.length) {
        const next = blob[j + 1]
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next
        j += 2
      } else {
        value += blob[j]
        j++
      }
    }
    labels[key] = value
    i = j + 1
  }

  return labels
}

export function findSamples(
  metrics: PromMetrics,
  name: string,
  labelFilter: Record<string, string> = {},
): PromSample[] {
  return metrics.samples.filter((s) => {
    if (s.name !== name) return false
    for (const [k, v] of Object.entries(labelFilter)) {
      if (s.labels[k] !== v) return false
    }
    return true
  })
}

export function sumSamples(samples: PromSample[]): number {
  let sum = 0
  for (const s of samples) {
    if (Number.isFinite(s.value)) sum += s.value
  }
  return sum
}

export function avgSamples(samples: PromSample[]): number | null {
  if (samples.length === 0) return null
  const finite = samples.filter((s) => Number.isFinite(s.value))
  if (finite.length === 0) return null
  return sumSamples(finite) / finite.length
}

export function estimateHistogramPercentile(
  buckets: PromSample[],
  percentile: number,
): number | null {
  if (buckets.length === 0) return null

  const sorted = [...buckets]
    .map((b) => {
      const leRaw = b.labels.le
      const le = leRaw === '+Inf' ? Number.POSITIVE_INFINITY : Number(leRaw)
      return { le, count: b.value }
    })
    .filter((b) => !Number.isNaN(b.le))
    .sort((a, b) => a.le - b.le)

  if (sorted.length === 0) return null
  const total = sorted[sorted.length - 1].count
  if (!Number.isFinite(total) || total <= 0) return null

  const target = total * percentile
  for (let idx = 0; idx < sorted.length; idx++) {
    if (sorted[idx].count >= target) {
      if (sorted[idx].le === Number.POSITIVE_INFINITY) {
        return idx > 0 ? sorted[idx - 1].le : null
      }
      return sorted[idx].le
    }
  }
  return null
}

export function groupBucketsByLabels(
  samples: PromSample[],
  groupKeys: string[],
): Map<string, PromSample[]> {
  const groups = new Map<string, PromSample[]>()
  for (const s of samples) {
    const key = groupKeys.map((k) => `${k}=${s.labels[k] ?? ''}`).join('|')
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }
  return groups
}
