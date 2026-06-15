import * as fs from 'fs'
import * as path from 'path'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const DEFAULT_LINES = 200
const DEFAULT_MAX_CHARS = 20_000
const READ_CHUNK_BYTES = 64 * 1024

export async function readLogs(params: {
  path: string
  cwd: string
  lines?: number
  max_chars?: number
}): Promise<CodebuffToolOutput<'read_logs'>> {
  const requested = params.path
  const lines = Math.min(2_000, Math.max(1, params.lines ?? DEFAULT_LINES))
  const maxChars = Math.min(
    100_000,
    Math.max(100, params.max_chars ?? DEFAULT_MAX_CHARS),
  )
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
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
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

  let stat: fs.Stats
  let realResolved: string
  try {
    stat = fs.statSync(resolved)
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

  if (!stat.isFile()) {
    return [
      {
        type: 'json',
        value: {
          path: requested,
          errorMessage: `Path is not a regular file: ${resolved}`,
        },
      },
    ]
  }

  const fd = fs.openSync(realResolved, 'r')
  try {
    let collected = ''
    let lineCount = 0
    let offset = stat.size
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
    return [
      {
        type: 'json',
        value: {
          path: requested,
          resolvedPath: realResolved,
          lines: Math.min(lines, allLines.length),
          content,
          ...(truncated ? { truncated: true } : {}),
        },
      },
    ]
  } finally {
    fs.closeSync(fd)
  }
}
