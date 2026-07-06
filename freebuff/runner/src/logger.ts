import { enqueueLogRow, flushLogSink } from '@codebuff/logging'

import type { LogLevel, LogRow } from '@codebuff/common/types/contracts/logs'

const LOG_SERVICE = 'freebuff-runner'

function envName(): string {
  return process.env.NEXT_PUBLIC_CB_ENVIRONMENT ?? process.env.NODE_ENV ?? 'dev'
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return error
}

function normalizeData(data?: Record<string, unknown>) {
  if (!data) return {}
  return {
    ...data,
    ...(data && 'error' in data ? { error: serializeError(data.error) } : {}),
  }
}

function write(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const payload = {
    ...normalizeData(data),
    runnerId: process.env.RENDER_INSTANCE_ID ?? process.env.FREEBUFF_RUNNER_ID,
  }
  const row: LogRow = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    level,
    source: 'server',
    service: LOG_SERVICE,
    env: envName(),
    message,
    client_request_id:
      typeof data?.runId === 'string' ? String(data.runId) : null,
    data: payload,
  }

  enqueueLogRow(row)

  const line = JSON.stringify({
    source: LOG_SERVICE,
    level,
    message,
    ...payload,
  })
  if (level === 'error' || level === 'fatal') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) =>
    write('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) =>
    write('warn', message, data),
  error: (
    message: string,
    data?: Record<string, unknown> & { error?: unknown },
  ) => write('error', message, data),
}

export { flushLogSink }
