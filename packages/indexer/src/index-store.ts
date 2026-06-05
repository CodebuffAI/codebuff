import * as fs from 'node:fs'
import * as path from 'node:path'

import type { MetadataIndex } from './types'

const INDEX_FILE = 'metadata.json'
const INDEX_VERSION = '1'
const MAX_INDEX_AGE_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_CACHE_DIR = '.codebuff-index'

export function sanitizeIndexCacheDir(cacheDir = DEFAULT_CACHE_DIR): string {
  const normalized = cacheDir
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '')

  if (
    !normalized ||
    path.isAbsolute(cacheDir) ||
    path.posix.isAbsolute(normalized)
  ) {
    return DEFAULT_CACHE_DIR
  }

  const segments = normalized.split('/').filter(Boolean)
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === '.' || segment === '..' || segment.includes('\0'),
    )
  ) {
    return DEFAULT_CACHE_DIR
  }

  return segments.join('/')
}

export function getIndexDir(projectRoot: string, cacheDir = DEFAULT_CACHE_DIR): string {
  return path.join(projectRoot, sanitizeIndexCacheDir(cacheDir))
}

export async function loadIndex(
  projectRoot: string,
  cacheDir = '.codebuff-index',
): Promise<MetadataIndex | null> {
  const indexPath = path.join(getIndexDir(projectRoot, cacheDir), INDEX_FILE)
  try {
    const content = await fs.promises.readFile(indexPath, 'utf8')
    const parsed = JSON.parse(content) as MetadataIndex
    if (parsed.version !== INDEX_VERSION) return null
    if (parsed.projectRoot !== projectRoot) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveIndex(
  index: MetadataIndex,
  projectRoot: string,
  cacheDir = '.codebuff-index',
): Promise<void> {
  await ensureGitInfoExcludes(projectRoot, cacheDir)
  const dir = getIndexDir(projectRoot, cacheDir)
  await fs.promises.mkdir(dir, { recursive: true })
  const indexPath = path.join(dir, INDEX_FILE)
  await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8')
}

async function ensureGitInfoExcludes(
  projectRoot: string,
  cacheDir: string,
): Promise<void> {
  const normalizedCacheDir = sanitizeIndexCacheDir(cacheDir)

  const gitDir = path.join(projectRoot, '.git')
  const infoDir = path.join(gitDir, 'info')
  const excludePath = path.join(infoDir, 'exclude')

  try {
    const stat = await fs.promises.stat(gitDir)
    if (!stat.isDirectory()) return
    await fs.promises.mkdir(infoDir, { recursive: true })
    let existing = ''
    try {
      existing = await fs.promises.readFile(excludePath, 'utf8')
    } catch {}
    const excludeLine = `/${normalizedCacheDir}/`
    if (existing.split('\n').includes(excludeLine)) return
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
    await fs.promises.appendFile(excludePath, `${prefix}${excludeLine}\n`, 'utf8')
  } catch {
    // Best-effort only. Index writes must not fail just because git metadata is unavailable.
  }
}

export function isIndexStale(
  index: MetadataIndex,
  maxAgeMs = MAX_INDEX_AGE_MS,
): boolean {
  return Date.now() - index.builtAt > maxAgeMs
}

export function isIndexReady(
  index: MetadataIndex | null,
): index is MetadataIndex {
  return index !== null && index.fileCount > 0
}
