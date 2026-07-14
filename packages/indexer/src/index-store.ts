import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import type { FileVector } from './semantic'
import type { MetadataIndex } from './types'
import { buildIndexQueryData } from './query-data'

const INDEX_FILE = 'metadata.json'
const INDEX_VERSION = '2'
const SEMANTIC_VECTOR_FILE = 'semantic-vectors.json'
const SEMANTIC_VECTOR_VERSION = '3'
const LEGACY_SEMANTIC_VECTOR_VERSIONS = new Set(['1', '2'])
const MAX_SEMANTIC_FINGERPRINTS = 4
export const MAX_INDEX_AGE_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_CACHE_DIR = '.codebuff-index'
const OWNER_FILE = '.openbuff-index-owner'
const LOCK_FILE = '.openbuff-index.lock'
const LOCK_TIMEOUT_MS = 10_000
const STALE_LOCK_MS = 5 * 60_000

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
    segments.length !== 1 ||
    !segments[0].startsWith('.') ||
    segments[0] === '.git' ||
    segments.some(
      (segment) =>
        segment === '.' || segment === '..' || segment.includes('\0'),
    )
  ) {
    return DEFAULT_CACHE_DIR
  }

  return segments.join('/')
}

export function getIndexDir(
  projectRoot: string,
  cacheDir = DEFAULT_CACHE_DIR,
): string {
  return path.join(projectRoot, sanitizeIndexCacheDir(cacheDir))
}

export async function loadIndex(
  projectRoot: string,
  cacheDir = '.codebuff-index',
): Promise<MetadataIndex | null> {
  const indexPath = path.join(getIndexDir(projectRoot, cacheDir), INDEX_FILE)
  try {
    const content = await fs.promises.readFile(indexPath, 'utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return null
    }
    if (!isMetadataIndex(parsed, projectRoot)) return null
    if (!parsed.queryData) {
      parsed.queryData = buildIndexQueryData(parsed.files, parsed.graph)
    }
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return null
  }
}

export async function saveIndex(
  index: MetadataIndex,
  projectRoot: string,
  cacheDir = '.codebuff-index',
  options: { expectedBuiltAt?: number | null } = {},
): Promise<boolean> {
  const dir = getIndexDir(projectRoot, cacheDir)
  await assertCacheOwnership(dir)
  await ensureGitInfoExcludes(projectRoot, cacheDir)
  await fs.promises.mkdir(dir, { recursive: true })
  await writeOwnerFile(dir)
  const indexPath = path.join(dir, INDEX_FILE)
  return await withCacheLock(dir, async () => {
    const current = await readJsonFile(indexPath)
    const currentBuiltAt =
      isRecord(current) &&
      current.projectRoot === projectRoot &&
      typeof current.builtAt === 'number'
        ? current.builtAt
        : null
    if (
      Object.prototype.hasOwnProperty.call(options, 'expectedBuiltAt') &&
      currentBuiltAt !== options.expectedBuiltAt
    ) {
      return false
    }
    if (currentBuiltAt !== null && currentBuiltAt > index.builtAt) {
      // A newer inter-process build won the race. Do not replace it with an
      // older snapshot that began before the winning process.
      return false
    }
    await atomicWriteJson(indexPath, index)
    return true
  })
}

export interface CachedSemanticVector {
  embeddingHash: string
  vector: number[]
}

interface SemanticVectorCacheV3 {
  version: typeof SEMANTIC_VECTOR_VERSION
  projectRoot: string
  fingerprints: Record<
    string,
    {
      updatedAt: number
      vectors: Record<string, number[]>
    }
  >
}

/**
 * Load compatible vectors for one embedding configuration. Invalid, foreign,
 * or unknown cache schemas are treated as misses so lexical indexing remains
 * available and the next successful build can safely replace the cache.
 */
export async function loadSemanticVectors(
  projectRoot: string,
  fingerprint: string,
  cacheDir = DEFAULT_CACHE_DIR,
): Promise<CachedSemanticVector[]> {
  const cache = await readSemanticVectorCache(projectRoot, cacheDir)
  if (!cache) return []
  const entry = cache.fingerprints[fingerprint]
  if (!entry) return []
  return Object.entries(entry.vectors).map(([embeddingHash, vector]) => ({
    embeddingHash,
    vector,
  }))
}

/** Persist vectors atomically, retaining a small bounded set of model caches. */
export async function saveSemanticVectors(
  projectRoot: string,
  fingerprint: string,
  vectors: FileVector[],
  cacheDir = DEFAULT_CACHE_DIR,
): Promise<void> {
  const dir = getIndexDir(projectRoot, cacheDir)
  await assertCacheOwnership(dir)
  await ensureGitInfoExcludes(projectRoot, cacheDir)
  await fs.promises.mkdir(dir, { recursive: true })
  await writeOwnerFile(dir)

  const cachePath = path.join(dir, SEMANTIC_VECTOR_FILE)
  await withCacheLock(dir, async () => {
    const existing =
      (await readSemanticVectorCache(projectRoot, cacheDir)) ??
      emptySemanticVectorCache(projectRoot)
    const byHash: Record<string, number[]> = {}
    for (const entry of vectors) {
      if (entry.embeddingHash && isValidVector(entry.vector)) {
        byHash[entry.embeddingHash] = entry.vector
      }
    }
    existing.fingerprints[fingerprint] = {
      updatedAt: Date.now(),
      vectors: byHash,
    }

    const retained = Object.entries(existing.fingerprints)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SEMANTIC_FINGERPRINTS)
    existing.fingerprints = Object.fromEntries(retained)
    await atomicWriteJson(cachePath, existing)
  })
}

async function assertCacheOwnership(dir: string): Promise<void> {
  try {
    const entries = await fs.promises.readdir(dir)
    const legacyOwned = entries.every(
      (entry) => entry === INDEX_FILE || entry === SEMANTIC_VECTOR_FILE,
    )
    if (entries.length > 0 && !entries.includes(OWNER_FILE) && !legacyOwned) {
      throw new Error(`Refusing to use non-owned index cache directory: ${dir}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function writeOwnerFile(dir: string): Promise<void> {
  await fs.promises
    .writeFile(path.join(dir, OWNER_FILE), 'openbuff-index\n', { flag: 'wx' })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
}

function emptySemanticVectorCache(projectRoot: string): SemanticVectorCacheV3 {
  return {
    version: SEMANTIC_VECTOR_VERSION,
    projectRoot,
    fingerprints: {},
  }
}

async function readSemanticVectorCache(
  projectRoot: string,
  cacheDir: string,
): Promise<SemanticVectorCacheV3 | null> {
  const cachePath = path.join(
    getIndexDir(projectRoot, cacheDir),
    SEMANTIC_VECTOR_FILE,
  )
  try {
    const parsed: unknown = JSON.parse(
      await fs.promises.readFile(cachePath, 'utf8'),
    )
    return normalizeSemanticVectorCache(parsed, projectRoot)
  } catch {
    return null
  }
}

function normalizeSemanticVectorCache(
  value: unknown,
  projectRoot: string,
): SemanticVectorCacheV3 | null {
  if (!isRecord(value) || value.projectRoot !== projectRoot) return null

  if (
    value.version === SEMANTIC_VECTOR_VERSION &&
    isRecord(value.fingerprints)
  ) {
    const fingerprints: SemanticVectorCacheV3['fingerprints'] = {}
    for (const [fingerprint, rawEntry] of Object.entries(value.fingerprints)) {
      if (!isRecord(rawEntry) || !isRecord(rawEntry.vectors)) continue
      const vectors = normalizeVectorRecord(rawEntry.vectors)
      fingerprints[fingerprint] = {
        updatedAt:
          typeof rawEntry.updatedAt === 'number' &&
          Number.isFinite(rawEntry.updatedAt)
            ? rawEntry.updatedAt
            : 0,
        vectors,
      }
    }
    return { version: SEMANTIC_VECTOR_VERSION, projectRoot, fingerprints }
  }

  // Older schemas were keyed by content hash even though the embedded text
  // included the path. Reusing them would be semantically stale after rename
  // or for duplicate-content files, so treat them as safe misses.
  if (
    typeof value.version === 'string' &&
    LEGACY_SEMANTIC_VECTOR_VERSIONS.has(value.version)
  )
    return null

  return null
}

function normalizeVectorRecord(
  value: Record<string, unknown>,
): Record<string, number[]> {
  const vectors: Record<string, number[]> = {}
  for (const [hash, vector] of Object.entries(value)) {
    if (hash.length > 0 && isValidVector(vector)) vectors[hash] = vector
  }
  return vectors
}

function isValidVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (component) =>
        typeof component === 'number' && Number.isFinite(component),
    )
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMetadataIndex(
  value: unknown,
  projectRoot: string,
): value is MetadataIndex {
  if (
    !isRecord(value) ||
    value.version !== INDEX_VERSION ||
    value.projectRoot !== projectRoot ||
    typeof value.builtAt !== 'number' ||
    !Number.isFinite(value.builtAt) ||
    !isRecord(value.files) ||
    !isRecord(value.graph)
  ) {
    return false
  }
  if (!isRecord(value.graph.nodes) || !Array.isArray(value.graph.edges)) {
    return false
  }
  value.fileCount = Object.keys(value.files).length
  return true
}

async function withCacheLock<T>(
  dir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = path.join(dir, LOCK_FILE)
  const deadline = Date.now() + LOCK_TIMEOUT_MS

  while (true) {
    try {
      const handle = await fs.promises.open(lockPath, 'wx')
      const ownerToken = `${process.pid}:${randomUUID()}`
      try {
        await handle.writeFile(`${ownerToken}\n${Date.now()}\n`, 'utf8')
        return await operation()
      } finally {
        await handle.close().catch(() => {})
        try {
          const currentOwner = await fs.promises.readFile(lockPath, 'utf8')
          if (currentOwner.startsWith(`${ownerToken}\n`)) {
            await fs.promises.rm(lockPath, { force: true })
          }
        } catch {
          // A stale-lock recovery may already have removed it.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try {
        const stat = await fs.promises.stat(lockPath)
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.promises.rm(lockPath, { force: true })
          continue
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw statError
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for index cache lock: ${lockPath}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
}

async function atomicWriteJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  let handle: fs.promises.FileHandle | undefined
  try {
    handle = await fs.promises.open(temporaryPath, 'wx')
    await handle.writeFile(JSON.stringify(value, null, 2), 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await fs.promises.rename(temporaryPath, filePath)
  } finally {
    await handle?.close().catch(() => {})
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
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
    await fs.promises.appendFile(
      excludePath,
      `${prefix}${excludeLine}\n`,
      'utf8',
    )
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
