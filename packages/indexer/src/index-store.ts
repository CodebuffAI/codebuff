import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import type { FileVector } from './semantic'
import type { MetadataIndex } from './types'

const INDEX_FILE = 'metadata.json'
const INDEX_VERSION = '2'
const SEMANTIC_VECTOR_FILE = 'semantic-vectors.json'
const SEMANTIC_VECTOR_VERSION = '2'
const LEGACY_SEMANTIC_VECTOR_VERSION = '1'
const MAX_SEMANTIC_FINGERPRINTS = 4
export const MAX_INDEX_AGE_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_CACHE_DIR = '.codebuff-index'
const OWNER_FILE = '.openbuff-index-owner'

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
  const dir = getIndexDir(projectRoot, cacheDir)
  await assertCacheOwnership(dir)
  await ensureGitInfoExcludes(projectRoot, cacheDir)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises
    .writeFile(path.join(dir, OWNER_FILE), 'openbuff-index\n', {
      flag: 'wx',
    })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
  const indexPath = path.join(dir, INDEX_FILE)
  await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8')
}

export interface CachedSemanticVector {
  hash: string
  vector: number[]
}

interface SemanticVectorCacheV2 {
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

interface SemanticVectorCacheV1 {
  version: typeof LEGACY_SEMANTIC_VECTOR_VERSION
  projectRoot: string
  fingerprint: string
  vectors: FileVector[]
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
  return Object.entries(entry.vectors).map(([hash, vector]) => ({
    hash,
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

  const existing =
    (await readSemanticVectorCache(projectRoot, cacheDir)) ??
    emptySemanticVectorCache(projectRoot)
  const byHash: Record<string, number[]> = {}
  for (const entry of vectors) {
    if (entry.hash && isValidVector(entry.vector)) {
      byHash[entry.hash] = entry.vector
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

  const cachePath = path.join(dir, SEMANTIC_VECTOR_FILE)
  const temporaryPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.promises.writeFile(temporaryPath, JSON.stringify(existing), 'utf8')
    await fs.promises.rename(temporaryPath, cachePath)
  } finally {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
  }
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

function emptySemanticVectorCache(projectRoot: string): SemanticVectorCacheV2 {
  return {
    version: SEMANTIC_VECTOR_VERSION,
    projectRoot,
    fingerprints: {},
  }
}

async function readSemanticVectorCache(
  projectRoot: string,
  cacheDir: string,
): Promise<SemanticVectorCacheV2 | null> {
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
): SemanticVectorCacheV2 | null {
  if (!isRecord(value) || value.projectRoot !== projectRoot) return null

  if (
    value.version === SEMANTIC_VECTOR_VERSION &&
    isRecord(value.fingerprints)
  ) {
    const fingerprints: SemanticVectorCacheV2['fingerprints'] = {}
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

  // V1 stored one fingerprint and path-oriented vectors. Normalize in memory;
  // the next save atomically rewrites it as the hash-keyed V2 schema.
  if (
    value.version === LEGACY_SEMANTIC_VECTOR_VERSION &&
    typeof value.fingerprint === 'string' &&
    Array.isArray(value.vectors)
  ) {
    const legacy = value as unknown as SemanticVectorCacheV1
    const vectors: Record<string, number[]> = {}
    for (const entry of legacy.vectors) {
      if (
        isRecord(entry) &&
        typeof entry.hash === 'string' &&
        isValidVector(entry.vector)
      ) {
        vectors[entry.hash] = entry.vector
      }
    }
    return {
      version: SEMANTIC_VECTOR_VERSION,
      projectRoot,
      fingerprints: {
        [legacy.fingerprint]: { updatedAt: 0, vectors },
      },
    }
  }

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
