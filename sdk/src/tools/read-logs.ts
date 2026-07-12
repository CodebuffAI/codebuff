import * as fs from 'fs'
import * as path from 'path'

import { getBackgroundJob, safeOpenJobLogForRead } from './background-jobs'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const DEFAULT_LINES = 200
const DEFAULT_MAX_CHARS = 20_000
const READ_CHUNK_BYTES = 64 * 1024

type ReadLogsParams = {
  cwd: string
  path?: string
  jobId?: string
  lines?: number
  max_chars?: number
}

export async function readLogs(
  params: ReadLogsParams,
): Promise<CodebuffToolOutput<'read_logs'>> {
  const lines = Math.min(2_000, Math.max(1, params.lines ?? DEFAULT_LINES))
  const maxChars = Math.min(
    100_000,
    Math.max(100, params.max_chars ?? DEFAULT_MAX_CHARS),
  )

  if (params.jobId) {
    const job = getBackgroundJob(params.jobId)
    if (!job) {
      return [
        {
          type: 'json',
          value: {
            path: params.path ?? '',
            jobId: params.jobId,
            errorMessage: `No background job found with id "${params.jobId}".`,
          },
        },
      ]
    }

    const tail = readTail(job.logFile, lines, maxChars)
    if ('errorMessage' in tail) {
      return [
        {
          type: 'json',
          value: {
            path: job.logFile,
            jobId: job.jobId,
            errorMessage: tail.errorMessage,
          },
        },
      ]
    }

    return [
      {
        type: 'json',
        value: {
          path: job.logFile,
          resolvedPath: job.logFile,
          jobId: job.jobId,
          status: job.status,
          ...tail,
        },
      },
    ]
  }

  if (!params.path) {
    return [
      {
        type: 'json',
        value: {
          path: '',
          errorMessage: 'Either path or jobId is required.',
        },
      },
    ]
  }

  const requested = params.path
  let rootRealPath: string
  try {
    rootRealPath = fs.realpathSync(params.cwd)
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          path: requested,
          errorMessage: `Could not resolve project directory: ${(error as Error).message}`,
        },
      },
    ]
  }

  const resolved = path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(rootRealPath, requested)

  const isInsideRoot = (target: string) => {
    const relative = path.relative(rootRealPath, target)
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    )
  }

  if (!isInsideRoot(resolved)) {
    return [
      {
        type: 'json',
        value: {
          path: requested,
          errorMessage: `Path is outside the project directory: ${requested}`,
        },
      },
    ]
  }

  let realResolved: string
  try {
    realResolved = fs.realpathSync(resolved)
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          path: requested,
          errorMessage: `Could not stat log file: ${(error as Error).message}`,
        },
      },
    ]
  }

  if (!isInsideRoot(realResolved)) {
    return [
      {
        type: 'json',
        value: {
          path: requested,
          errorMessage: `Path is outside the project directory: ${requested}`,
        },
      },
    ]
  }

  const tail = readTail(realResolved, lines, maxChars)
  if ('errorMessage' in tail) {
    return [
      {
        type: 'json',
        value: {
          path: requested,
          errorMessage: tail.errorMessage,
        },
      },
    ]
  }

  return [
    {
      type: 'json',
      value: {
        path: requested,
        resolvedPath: realResolved,
        ...tail,
      },
    },
  ]
}

function readTail(
  filePath: string,
  lines: number,
  maxChars: number,
):
  | { lines: number; content: string; truncated?: boolean }
  | { lines: number; content: string; errorMessage: string } {
  const opened = safeOpenJobLogForRead(filePath)
  if ('errorMessage' in opened) {
    return {
      lines: 0,
      content: '',
      errorMessage: opened.errorMessage,
    }
  }

  const { fd, size } = opened
  try {
    let collected = ''
    let lineCount = 0
    let offset = size
    while (offset > 0 && lineCount <= lines) {
      const length = Math.min(READ_CHUNK_BYTES, offset)
      offset -= length
      const buf = Buffer.alloc(length)
      fs.readSync(fd, buf, 0, length, offset)
      const chunk = buf.toString('utf8')
      collected = chunk + collected
      lineCount = (collected.match(/\n/g) ?? []).length
    }

    const endsWithNewline = collected.endsWith('\n')
    const allLines = collected.split('\n')
    if (endsWithNewline) {
      allLines.pop()
    }
    const selectedLines = allLines.slice(-lines)
    const tail =
      selectedLines.join('\n') +
      (endsWithNewline && selectedLines.length > 0 ? '\n' : '')
    let truncated = false
    let content = tail
    if (content.length > maxChars) {
      content = content.slice(content.length - maxChars)
      truncated = true
    }

    return {
      lines: Math.min(lines, allLines.length),
      content,
      ...(truncated ? { truncated: true } : {}),
    }
  } finally {
    fs.closeSync(fd)
  }
}
