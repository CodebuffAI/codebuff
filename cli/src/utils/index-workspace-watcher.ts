import { existsSync, statSync, watch } from 'node:fs'
import path from 'node:path'

import type { IndexManager, IndexingConfig } from '@codebuff/indexer'

type WatcherEntry = {
  close: () => void
  manager: IndexManager
}

const watchers = new Map<string, WatcherEntry>()
const MAX_WATCHED_ROOTS = 4
const IGNORED_TOP_LEVEL = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  'coverage',
])

export function classifyIndexWatchPath(params: {
  projectRoot: string
  fileName: string
  cacheDir?: string
}):
  | { kind: 'ignore' }
  | { kind: 'changed'; path: string }
  | { kind: 'deleted'; path: string }
  | { kind: 'ambiguous' } {
  const relativePath = params.fileName.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!relativePath || relativePath === '.') return { kind: 'ambiguous' }
  const topLevel = relativePath.split('/')[0]!
  const cacheDir = (params.cacheDir ?? '.codebuff-index')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/$/, '')
  if (
    IGNORED_TOP_LEVEL.has(topLevel) ||
    relativePath === cacheDir ||
    relativePath.startsWith(`${cacheDir}/`)
  ) {
    return { kind: 'ignore' }
  }
  const absolutePath = path.join(params.projectRoot, relativePath)
  if (!existsSync(absolutePath)) {
    return path.extname(relativePath)
      ? { kind: 'deleted', path: relativePath }
      : { kind: 'ambiguous' }
  }
  try {
    return statSync(absolutePath).isFile()
      ? { kind: 'changed', path: relativePath }
      : { kind: 'ambiguous' }
  } catch {
    return { kind: 'ambiguous' }
  }
}

export function ensureIndexWorkspaceWatcher(params: {
  projectRoot: string
  config: IndexingConfig
  manager: IndexManager
}): void {
  if (params.config.enabled === false) return
  const projectRoot = path.resolve(params.projectRoot)
  const existing = watchers.get(projectRoot)
  if (existing?.manager === params.manager) return
  existing?.close()

  const changedPaths = new Set<string>()
  const deletedPaths = new Set<string>()
  let ambiguous = false
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    flushTimer = undefined
    if (ambiguous) {
      params.manager.markStale()
    } else if (changedPaths.size > 0 || deletedPaths.size > 0) {
      params.manager.markPathsChanged({
        changedPaths: [...changedPaths].sort(),
        deletedPaths: [...deletedPaths].sort(),
        complete: true,
      })
    }
    changedPaths.clear()
    deletedPaths.clear()
    ambiguous = false
  }
  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, 75)
    flushTimer.unref?.()
  }

  try {
    const watcher = watch(
      projectRoot,
      { recursive: true, persistent: false },
      (_eventType, fileName) => {
        const classified = classifyIndexWatchPath({
          projectRoot,
          fileName: String(fileName ?? ''),
          cacheDir: params.config.cacheDir,
        })
        if (classified.kind === 'ignore') return
        if (classified.kind === 'ambiguous') {
          ambiguous = true
        } else if (classified.kind === 'changed') {
          changedPaths.add(classified.path)
          deletedPaths.delete(classified.path)
        } else {
          deletedPaths.add(classified.path)
          changedPaths.delete(classified.path)
        }
        scheduleFlush()
      },
    )
    watcher.on('error', () => {
      ambiguous = true
      scheduleFlush()
    })
    watchers.set(projectRoot, {
      manager: params.manager,
      close: () => {
        if (flushTimer) clearTimeout(flushTimer)
        watcher.close()
      },
    })
    while (watchers.size > MAX_WATCHED_ROOTS) {
      const oldestRoot = watchers.keys().next().value
      if (!oldestRoot) break
      watchers.get(oldestRoot)?.close()
      watchers.delete(oldestRoot)
    }
  } catch {
    // Some filesystems do not support recursive watching. Age-based integrity
    // sweeps and explicit SDK mutation deltas remain active in that case.
  }
}
