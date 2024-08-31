import { isEqual, flatten } from 'lodash'

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.metricDescriptors#MetricKind
export type MetricKind = 'GAUGE' | 'CUMULATIVE'

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
export type MetricValueKind =
  | 'int64Value'
  | 'doubleValue'
  | 'stringValue'
  | 'boolValue'
  | 'distributionValue'

export type MetricDescriptor = {
  metricKind: MetricKind
  valueKind: MetricValueKind
}

export type MetricLabels = Record<string, string>

export const CUSTOM_METRICS = {
  'ws/open_connections': {
    metricKind: 'GAUGE',
    valueKind: 'int64Value',
  },
  'ws/connections_established': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'ws/connections_terminated': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'ws/broadcasts_sent': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'http/request_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'http/request_latency': {
    metricKind: 'GAUGE',
    valueKind: 'distributionValue',
  },
  'pg/transaction_duration': {
    metricKind: 'GAUGE',
    valueKind: 'distributionValue',
  },
  'app/bet_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'app/contract_view_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/query_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_established': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_terminated': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_disconnected': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_acquired': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_released': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/pool_connections': {
    metricKind: 'GAUGE',
    valueKind: 'int64Value',
  },
  'vercel/revalidations_succeeded': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'vercel/revalidations_failed': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
} as const satisfies { [k: string]: MetricDescriptor }

// the typing for all this could be way fancier, but seems overkill

export type CustomMetrics = typeof CUSTOM_METRICS
export type MetricType = keyof CustomMetrics

export type MetricStoreEntry = {
  type: MetricType
  labels?: MetricLabels
  fresh: boolean // whether this metric was touched since last time
  startTime: number // used for cumulative metrics
  points?: number[] // used for distribution metrics
  value: number
}

/** Records metric values by type and labels for later export. */
export class MetricStore {
  // { name: [...entries of that metric with different label values] }
  data: Map<MetricType, MetricStoreEntry[]>

  constructor() {
    this.data = new Map()
  }

  clear() {
    this.data.clear()
  }

  push(type: MetricType, val: number, labels?: MetricLabels) {
    const entry = this.getOrCreate(type, labels)
    let points = entry.points
    if (points == null) {
      points = entry.points = []
    }
    points.push(val)
    entry.fresh = true
  }

  set(type: MetricType, val: number, labels?: MetricLabels) {
    const entry = this.getOrCreate(type, labels)
    entry.value = val
    entry.fresh = true
  }

  inc(type: MetricType, labels?: MetricLabels) {
    const entry = this.getOrCreate(type, labels)
    entry.value += 1
    entry.fresh = true
  }

  freshEntries() {
    return flatten(
      Array.from(this.data.entries(), ([_, vs]) => vs.filter((e) => e.fresh))
    )
  }

  // mqp: we could clear all gauges but then we should centralize the process for polling
  // them in order to not have weird gaps.
  clearDistributionGauges() {
    for (const k of this.data.keys()) {
      const { metricKind, valueKind } = CUSTOM_METRICS[k]
      if (metricKind === 'GAUGE' && valueKind === 'distributionValue') {
        this.data.delete(k)
      }
    }
  }

  getOrCreate(type: MetricType, labels?: MetricLabels) {
    let entries = this.data.get(type)
    if (entries == null) {
      this.data.set(type, (entries = []))
    }
    for (const entry of entries) {
      if (isEqual(labels ?? {}, entry.labels ?? {})) {
        return entry
      }
    }
    // none exists, so create it
    const entry = { type, labels, startTime: Date.now(), fresh: true, value: 0 }
    entries.push(entry)
    return entry as MetricStoreEntry
  }
}

/** The global metric store. */
export const metrics = new MetricStore()
