import { MetricServiceClient } from '@google-cloud/monitoring'
import { average, sumOfSquaredError } from 'common/util/math'
import { log } from 'shared/utils'
import { InstanceInfo, getInstanceInfo } from './instance-info'
import { chunk } from 'lodash'
import {
  CUSTOM_METRICS,
  MetricStore,
  MetricStoreEntry,
  metrics,
} from './metrics'

// how often metrics are written. GCP says don't write for a single time series
// more than once per 5 seconds.
export const METRICS_INTERVAL_MS = 60_000

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null

function serializeTimestamp(ts: number) {
  const seconds = ts / 1000
  const nanos = (ts % 1000) * 1000
  return { seconds, nanos } as const
}

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.snoozes#timeinterval
function serializeInterval(entry: MetricStoreEntry, ts: number) {
  switch (CUSTOM_METRICS[entry.type].metricKind) {
    case 'CUMULATIVE':
      return {
        startTime: serializeTimestamp(entry.startTime),
        endTime: serializeTimestamp(ts),
      }
    case 'GAUGE': {
      return { endTime: serializeTimestamp(ts) }
    }
  }
}

function serializeDistribution(points: number[]) {
  // see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue#distribution
  return {
    count: points.length,
    mean: average(points),
    sumOfSquaredDeviation: sumOfSquaredError(points),
    // not interested in handling histograms right now
    bucketOptions: { explicitBuckets: { bounds: [0] } },
    bucketCounts: [0, points.length],
  }
}

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
function serializeValue(entry: MetricStoreEntry) {
  switch (CUSTOM_METRICS[entry.type].valueKind) {
    case 'int64Value':
      return { int64Value: entry.value }
    case 'distributionValue': {
      return { distributionValue: serializeDistribution(entry.points ?? []) }
    }
    default:
      throw new Error('Other value kinds not yet implemented.')
  }
}

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TimeSeries
function serializeEntries(
  instance: InstanceInfo,
  entries: MetricStoreEntry[],
  ts: number
) {
  return entries.map((entry) => ({
    metricKind: CUSTOM_METRICS[entry.type].metricKind,
    resource: {
      type: 'gce_instance',
      labels: {
        project_id: instance.projectId,
        instance_id: instance.instanceId,
        zone: instance.zone,
      },
    },
    metric: {
      type: `custom.googleapis.com/${entry.type}`,
      labels: entry.labels ?? {},
    },
    points: [
      {
        interval: serializeInterval(entry, ts),
        value: serializeValue(entry),
      },
    ],
  }))
}

/** Writes metrics out to GCP's API from a metric store on an interval. */
export class MetricWriter {
  client: MetricServiceClient
  store: MetricStore
  intervalMs: number
  instance?: InstanceInfo
  runInterval?: NodeJS.Timeout

  constructor(store: MetricStore, intervalMs: number) {
    this.client = new MetricServiceClient()
    this.store = store
    this.intervalMs = intervalMs
  }

  async write() {
    const freshEntries = this.store.freshEntries()
    if (freshEntries.length > 0) {
      for (const entry of freshEntries) {
        entry.fresh = false
      }
      if (!LOCAL_DEV) {
        log.debug('Writing GCP metrics.', { entries: freshEntries })
        if (this.instance == null) {
          this.instance = await getInstanceInfo()
          log.debug('Retrieved instance metadata.', {
            instance: this.instance,
          })
        }
        // mqp: bump now by 1ms to avoid it being === to just written entry times
        const now = Date.now() + 1
        const name = this.client.projectPath(this.instance.projectId)
        const timeSeries = serializeEntries(this.instance, freshEntries, now)
        // GCP imposes a max 200 per call limit
        for (const batch of chunk(timeSeries, 200)) {
          this.store.clearDistributionGauges()
          // see https://cloud.google.com/monitoring/custom-metrics/creating-metrics
          await this.client.createTimeSeries({ timeSeries: batch, name })
        }
      }
    }
  }

  start() {
    if (!this.runInterval) {
      this.runInterval = setInterval(async () => {
        try {
          await this.write()
        } catch (error) {
          log.error('Failed to write metrics.', { error })
        }
      }, this.intervalMs)
    }
  }

  stop() {
    clearTimeout(this.runInterval)
  }
}

export const METRIC_WRITER = new MetricWriter(metrics, METRICS_INTERVAL_MS)
