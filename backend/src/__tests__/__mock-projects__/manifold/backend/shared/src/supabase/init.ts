import * as pgPromise from 'pg-promise'
import { createClient } from 'common/supabase/utils'
export { type SupabaseClient } from 'common/supabase/utils'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { metrics, log, isProd } from '../utils'
import { IDatabase, ITask } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { HOUR_MS } from 'common/util/time'
import { METRICS_INTERVAL_MS } from 'shared/monitoring/metric-writer'
import { getMonitoringContext } from 'shared/monitoring/context'

export const pgp = pgPromise({
  error(err: any, e: pgPromise.IEventContext) {
    // Read more: https://node-postgres.com/apis/pool#error
    log.error('pgPromise background error', {
      error: err,
      event: e,
    })
  },
  disconnect() {
    metrics.inc('pg/connections_disconnected')
  },
  transact(e) {
    if (e.ctx.finish) {
      const { ctx, query } = e
      const { duration, success } = ctx
      if (!duration) return
      const successStr = success ? 'true' : 'false'

      const mctx = getMonitoringContext()
      if (mctx?.baseEndpoint) {
        metrics.push('pg/transaction_duration', duration, {
          baseEndpoint: mctx.baseEndpoint,
          endpoint: mctx.endpoint,
          query,
          successStr,
        })
      } else if (mctx?.job) {
        metrics.push('pg/transaction_duration', duration, {
          job: mctx.job,
          query,
          successStr,
        })
      } else {
        metrics.push('pg/transaction_duration', duration, { query, successStr })
      }
    }
  },
  query() {
    const ctx = getMonitoringContext()
    if (ctx?.endpoint) {
      metrics.inc('pg/query_count', { endpoint: ctx.endpoint })
    } else if (ctx?.job) {
      metrics.inc('pg/query_count', { job: ctx.job })
    } else {
      metrics.inc('pg/query_count')
    }
  },
})

// get type id via SELECT oid, typname FROM pg_type where typename = '...'

// This loses precision for large numbers (> 2^53). Beware fetching int8 columns with large values.
pgp.pg.types.setTypeParser(20, (value) => parseInt(value, 10)) // int8.
pgp.pg.types.setTypeParser(1700, parseFloat) // numeric

pgp.pg.types.setTypeParser(1082, (value) => value) // date (not timestamp! has no time info so we just parse as string)
export type SupabaseDirectClientTimeout = IDatabase<{}, IClient> & {
  timeout: TimeoutTask
}
export type SupabaseTransaction = ITask<{}>
export type SupabaseDirectClient =
  | SupabaseDirectClientTimeout
  | SupabaseTransaction

export function getInstanceId() {
  return (
    process.env.SUPABASE_INSTANCE_ID ??
    (isProd() ? PROD_CONFIG.supabaseInstanceId : DEV_CONFIG.supabaseInstanceId)
  )
}

export function getInstanceHostname(instanceId: string) {
  return `${instanceId}.supabase.co`
}
/**@deprecated: Use createSupabaseDirectClient instead. */
export function createSupabaseClient() {
  const instanceId = getInstanceId()
  if (!instanceId) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_INSTANCE_ID and no instance ID in config."
    )
  }
  const key = process.env.SUPABASE_KEY
  if (!key) {
    throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
  }

  // mqp - note that if you want to pass autoRefreshToken: true, you MUST call
  // `client.auth.stopAutoRefresh` on the client when you are done or it will
  // leak the refresh interval!
  log('Creating supabase client connection')

  return createClient(instanceId, key, { auth: { autoRefreshToken: false } })
}

type TimeoutTask = <T>(
  timeoutInMs: number,
  queryMethod: (t: ITask<{}>) => Promise<T>,
  serialize?: boolean
) => Promise<T>

// Use one connection to avoid WARNING: Creating a duplicate database object for the same connection.
let pgpDirect: SupabaseDirectClientTimeout | null = null
export function createSupabaseDirectClient(
  instanceId?: string,
  password?: string
): SupabaseDirectClientTimeout {
  if (pgpDirect) return pgpDirect
  instanceId = instanceId ?? getInstanceId()
  if (!instanceId) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_INSTANCE_ID and no instance ID in config."
    )
  }
  password = password ?? process.env.SUPABASE_PASSWORD
  if (!password) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_PASSWORD."
    )
  }
  log('Connecting to postgres')
  const client = pgp({
    host: `db.${getInstanceHostname(instanceId)}`,
    port: 5432,
    user: `postgres`,
    password: password,

    // ian: query_timeout doesn't cancel long-running queries, it just stops waiting for them
    query_timeout: HOUR_MS, // mqp: debugging scheduled job behavior

    // ian: during a pool-depletion-related outage, we can cancel any stuck queries
    // without a huge backlog of waiting connections instead of redeploying the api.
    // See queries to run during outage here: https://www.notion.so/manifoldmarkets/Backend-resources-8fba2b67cad04dd188564442c5876bfa?pvs=4#a8629a618e9e44ee9b6bbe408b10f9ff
    connectionTimeoutMillis: 10_000,

    // ian: during the past few outages we've seen a lot of "idle in transaction" connections
    // that last for approx. an hour. See: https://docs.google.com/spreadsheets/d/1GrXMQtPXRL3j3dSza7rwI4fRmFjabk0x1sJYoTRKpoE/edit?gid=801504140#gid=801504140
    // Although we don't yet know the cause, setting this timeout will limit the damage
    // from these connections. We should figure out the cause ASAP.
    idle_in_transaction_session_timeout: 15_000,
    max: 20,
  })
  const pool = client.$pool
  pool.on('connect', () => metrics.inc('pg/connections_established'))
  pool.on('remove', () => metrics.inc('pg/connections_terminated'))
  pool.on('acquire', () => metrics.inc('pg/connections_acquired'))
  pool.on('release', () => metrics.inc('pg/connections_released'))
  setInterval(() => {
    metrics.set('pg/pool_connections', pool.waitingCount, { state: 'waiting' })
    metrics.set('pg/pool_connections', pool.idleCount, { state: 'idle' })
    metrics.set('pg/pool_connections', pool.expiredCount, { state: 'expired' })
    metrics.set('pg/pool_connections', pool.totalCount, { state: 'total' })
  }, METRICS_INTERVAL_MS)

  const timeout: TimeoutTask = async <T>(
    timeoutInMs: number,
    queryMethod: (t: ITask<{}>) => Promise<T>,
    serialize?: boolean
  ) => {
    let pid: number | undefined
    let timeoutId: NodeJS.Timeout | undefined

    const callback = async (t: ITask<{}>) => {
      const pidResult = await t.one('SELECT pg_backend_pid() AS pid')
      pid = pidResult.pid
      log('Query PID:', pid)
      return queryMethod(t)
    }

    const t = serialize
      ? client.tx({ mode: SERIAL_MODE }, callback)
      : client.tx(callback)

    const cancelAfterTimeout = new Promise<never>((_, reject) => {
      log(`Starting timeout: ${timeoutInMs / 1000} seconds`)
      timeoutId = setTimeout(async () => {
        if (pid) {
          try {
            log('Cancelling query:', pid)
            const cancelled = await pgpDirect!.one(
              'select pg_cancel_backend($1)',
              [pid],
              (data) => data.pg_cancel_backend
            )
            log('Cancelled:', cancelled)
          } catch (error) {
            log('Error cancelling query:', error)
          }
        }
        reject(new Error(`Query timed out after ${timeoutInMs}ms`))
      }, timeoutInMs)
    })

    try {
      const res = await Promise.race([t, cancelAfterTimeout])
      clearTimeout(timeoutId)
      return res
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  pgpDirect = {
    ...client,
    timeout,
  }
  return pgpDirect
}

export const SERIAL_MODE = new pgp.txMode.TransactionMode({
  tiLevel: pgp.txMode.isolationLevel.serializable,
  readOnly: false,
  deferrable: false,
})
