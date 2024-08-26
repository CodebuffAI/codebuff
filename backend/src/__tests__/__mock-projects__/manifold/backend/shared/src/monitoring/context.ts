// Shared contextual information that metrics and logging can use, e.g.
// the scheduler job or HTTP request endpoint currently running.

import { AsyncLocalStorage } from 'node:async_hooks'

export type ContextDetails = Record<string, string>

export type JobContext = ContextDetails & {
  job: string
  traceId: string
}

export type RequestContext = ContextDetails & {
  endpoint: string
  traceId: string
  baseEndpoint: string
}

export type MonitoringContext = JobContext | RequestContext

export const STORE = new AsyncLocalStorage<MonitoringContext>()

export function withMonitoringContext<R>(ctx: MonitoringContext, fn: () => R) {
  return STORE.run(ctx, fn)
}

export function getMonitoringContext() {
  return STORE.getStore()
}
