import { createHash } from 'node:crypto'

import { buildMetadataIndex, updateMetadataIndex } from './metadata-indexer'
import {
  isIndexReady,
  isIndexStale,
  getIndexDir,
  loadIndex,
  loadSemanticVectors,
  saveIndex,
  saveSemanticVectors,
} from './index-store'
import { queryIndex, type QueryOptions } from './query'
import {
  buildFileVectors,
  getSemanticConfigFingerprint,
  semanticSearch,
  blendSemanticScores,
} from './semantic'
import type { EmbedFn, FileVector, SemanticHit } from './semantic'
import type {
  IndexingConfig,
  IndexBuildError,
  IndexMutationDelta,
  IndexSnapshotIdentity,
  IndexStatus,
  LexicalWeights,
  MetadataIndex,
  QueryIndexMode,
  QueryIndexResult,
} from './types'

export class IndexManager {
  // Bounded LRU-ish (FIFO) cache of per-project-root singletons. Prevents
  // unbounded growth when many distinct project roots are indexed in one
  // long-lived process. Insertion order = recency; oldest entry evicted on
  // overflow.
  private static instances = new Map<string, IndexManager>()
  private static readonly MAX_INSTANCE_ROOTS = 8

  private index: MetadataIndex | null = null
  private buildPromise: Promise<void> | null = null
  private lastBuildAttempt = 0
  private forceRefresh = false
  private staleRefreshPending = false
  private embed?: EmbedFn
  private fileVectors: FileVector[] = []
  private lastBuildError: IndexBuildError | undefined
  private pendingMutationDelta: IndexMutationDelta | undefined
  private snapshotCache:
    | { index: MetadataIndex; identity: IndexSnapshotIdentity }
    | undefined
  private readonly MIN_RETRY_INTERVAL_MS = 30_000

  private constructor(
    private readonly projectRoot: string,
    private readonly config: IndexingConfig,
  ) {}

  static getInstance(
    projectRoot: string,
    config: IndexingConfig = {},
    embed?: EmbedFn,
  ): IndexManager {
    const key = IndexManager.getInstanceKey(projectRoot, config)
    let instance = IndexManager.instances.get(key)
    if (!instance) {
      // Evict the oldest entry when the per-root singleton cache is full so a
      // long-lived process indexing many distinct project roots can't grow it
      // without bound. Map keys iterate in insertion order.
      if (IndexManager.instances.size >= IndexManager.MAX_INSTANCE_ROOTS) {
        const oldestKey = IndexManager.instances.keys().next().value
        if (oldestKey !== undefined) {
          IndexManager.instances.delete(oldestKey)
        }
      }
      instance = new IndexManager(projectRoot, config)
      IndexManager.instances.set(key, instance)
    }
    // Wire an embedder the first time one is supplied (the CLI builds it from
    // the BYOK provider config). Kept out of the instance key so providing it
    // does not fork the singleton.
    if (embed && !instance.embed) {
      instance.embed = embed
      if (instance.index && instance.config.semantic?.enabled) {
        instance.fileVectors = []
        instance.forceRefresh = true
        instance.ensureBuilt()
      }
    }
    return instance
  }

  private static getInstanceKey(
    projectRoot: string,
    config: IndexingConfig,
  ): string {
    return JSON.stringify({
      projectRoot,
      enabled: config.enabled ?? true,
      cacheDir: config.cacheDir ?? '.codebuff-index',
      exclude: config.exclude ?? [],
      semantic: {
        enabled: config.semantic?.enabled ?? false,
        model: config.semantic?.model,
      },
      maxFiles: config.maxFiles ?? 20_000,
      weights: config.weights ?? null,
    })
  }

  /**
   * Start building the index in the background. Safe to call multiple times.
   * Returns immediately without blocking.
   */
  ensureBuilt(): void {
    if (this.config.enabled === false) return
    if (this.config.semantic?.enabled && !this.embed) {
      console.debug(
        '[indexer] semantic indexing is enabled but no embedder was provided; using metadata index only.',
      )
    }
    if (this.buildPromise) return
    if (
      !this.forceRefresh &&
      Date.now() - this.lastBuildAttempt < this.MIN_RETRY_INTERVAL_MS
    ) {
      return
    }
    const staleRefresh = this.forceRefresh
    const mutationDelta = this.pendingMutationDelta
    this.forceRefresh = false
    this.pendingMutationDelta = undefined
    this.staleRefreshPending = staleRefresh
    this.buildPromise = this._build(mutationDelta).finally(() => {
      this.buildPromise = null
      this.staleRefreshPending = false
    })
  }

  /**
   * Signal that on-disk files changed (e.g. the agent just edited code), so the
   * next {@link waitUntilReady}/{@link query} performs an incremental refresh
   * even if the index is not yet time-stale. Cheap and path-less: the
   * incremental update detects exactly which files changed by mtime/hash.
   */
  markStale(): void {
    this.pendingMutationDelta = undefined
    this.forceRefresh = true
  }

  /** Queue a precise filesystem mutation delta for the next refresh. */
  markPathsChanged(delta: IndexMutationDelta): void {
    this.pendingMutationDelta = mergeMutationDeltas(
      this.pendingMutationDelta,
      delta,
    )
    this.forceRefresh = true
  }

  /**
   * Wait for the index to be ready (up to timeoutMs).
   * Starts a build if needed.
   */
  async waitUntilReady(timeoutMs = 30_000): Promise<void> {
    this.scheduleRefreshIfNeeded()
    if (
      isIndexReady(this.index) &&
      !this.forceRefresh &&
      !this.staleRefreshPending &&
      (!this.config.semantic?.enabled || !this.embed || this.isSemanticReady())
    ) {
      return
    }
    this.ensureBuilt()
    if (!this.buildPromise) return
    await Promise.race([
      this.buildPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  }

  /**
   * Query the index. Returns empty results if index is not yet ready.
   *
   * Lexical field weights from `indexing.weights.lexical` in `openbuff.json`
   * are merged in (callers can still override per-query via `options.lexicalWeights`).
   */
  query(
    query: string,
    options: {
      limit?: number
      fileTypes?: string[]
      pathPrefixes?: string[]
      mode?: QueryIndexMode
      from?: string
      to?: string
      lexicalWeights?: LexicalWeights
    } = {},
  ): {
    results: QueryIndexResult[]
    ready: boolean
    totalIndexed: number
    indexAge: number
    status: IndexStatus
    snapshot?: IndexSnapshotIdentity
  } {
    if (this.config.enabled === false) {
      return {
        results: [],
        ready: false,
        totalIndexed: 0,
        indexAge: 0,
        status: this.getStatus(),
        snapshot: undefined,
      }
    }
    if (!isIndexReady(this.index)) {
      this.ensureBuilt()
      return {
        results: [],
        ready: false,
        totalIndexed: 0,
        indexAge: 0,
        status: this.getStatus(),
        snapshot: undefined,
      }
    }
    this.scheduleRefreshIfNeeded()
    if (this.forceRefresh || this.staleRefreshPending) {
      this.ensureBuilt()
      // Continue with the last known-good snapshot while refresh runs.
    }
    const results = queryIndex(
      this.index,
      query,
      withConfigLexicalWeights(options, this.config),
    ).map((result) => ({
      ...result,
      indexedHash: this.index!.files[result.path]?.hash,
    }))
    return {
      results,
      ready: true,
      totalIndexed: this.index.fileCount,
      indexAge: Date.now() - this.index.builtAt,
      status: this.getStatus(),
      snapshot: this.getSnapshotIdentity(this.index),
    }
  }

  /**
   * Like {@link query} but blends semantic-similarity hits into the lexical
   * ranking when semantic indexing is ready. Async because it embeds the query.
   * Falls back to pure lexical results when semantic is unavailable.
   *
   * The semantic blend weight from `indexing.weights.semanticBlend` in
   * `openbuff.json` controls how strongly semantic hits influence the combined
   * ranking (historical default: 1).
   */
  async queryBlended(
    query: string,
    options: {
      limit?: number
      fileTypes?: string[]
      pathPrefixes?: string[]
      mode?: QueryIndexMode
      from?: string
      to?: string
      lexicalWeights?: LexicalWeights
    } = {},
  ): Promise<{
    results: QueryIndexResult[]
    ready: boolean
    totalIndexed: number
    indexAge: number
    status: IndexStatus
    snapshot?: IndexSnapshotIdentity
  }> {
    const lexical = this.query(query, options)
    if (!lexical.ready || !this.index || !this.isSemanticReady()) {
      return lexical
    }
    // Semantic blending only applies to free-text search, not graph traversal.
    if (
      options.mode &&
      options.mode !== 'search' &&
      options.mode !== 'explain'
    ) {
      return lexical
    }

    const limit = options.limit ?? 20
    const semantic = await this.searchSemantic(
      query,
      limit,
      options.fileTypes,
      options.pathPrefixes,
    )
    if (semantic.length === 0) return lexical

    const lexByPath = new Map(lexical.results.map((r) => [r.path, r]))
    const blended = blendSemanticScores(
      lexical.results.map((r) => ({ path: r.path, score: r.score })),
      semantic,
      this.config.weights?.semanticBlend,
    ).slice(0, limit)

    const results: QueryIndexResult[] = blended.map(({ path, score }) => {
      const existing = lexByPath.get(path)
      if (existing) return { ...existing, score }
      // Semantic-only hit: surface it with file metadata from the index.
      const file = this.index!.files[path]
      return {
        path,
        score,
        matchedOn: ['semantic'],
        indexedHash: file?.hash,
        symbols: file?.symbols.slice(0, 10),
        headings: file?.headings.slice(0, 5),
      }
    })

    return { ...lexical, results }
  }

  private async _build(mutationDelta?: IndexMutationDelta): Promise<void> {
    if (this.config.enabled === false) return
    this.lastBuildAttempt = Date.now()
    const cacheDir = this.config.cacheDir ?? '.codebuff-index'
    let stage: IndexBuildError['stage'] = 'load'
    try {
      const existing = await loadIndex(this.projectRoot, cacheDir)
      const expectedBuiltAt = existing?.builtAt ?? null
      let index: MetadataIndex
      stage = 'walk'
      if (existing) {
        index = await updateMetadataIndex(
          existing,
          this.projectRoot,
          this.config,
          mutationDelta,
        )
      } else {
        index = await buildMetadataIndex(this.projectRoot, this.config)
      }
      if (mutationDelta?.revision !== undefined) {
        index.workspaceRevision = mutationDelta.revision
      }
      stage = 'persist'
      const persisted = await saveIndex(index, this.projectRoot, cacheDir, {
        expectedBuiltAt,
      })
      if (!persisted) {
        this.forceRefresh = true
        if (mutationDelta) {
          this.pendingMutationDelta = mergeMutationDeltas(
            this.pendingMutationDelta,
            mutationDelta,
          )
        }
      }
      this.index = (await loadIndex(this.projectRoot, cacheDir)) ?? index
      this.snapshotCache = undefined
      this.lastBuildError = undefined
      await this._buildVectors(this.index, cacheDir)
    } catch (err) {
      // Index build failures are never fatal
      console.debug('[indexer] build failed:', err)
      this.lastBuildError = createBuildError(
        stage,
        err,
        getIndexDir(this.projectRoot, cacheDir),
      )
      if (mutationDelta) {
        this.pendingMutationDelta = mergeMutationDeltas(
          this.pendingMutationDelta,
          mutationDelta,
        )
      }
    }
  }

  private getSnapshotIdentity(index: MetadataIndex): IndexSnapshotIdentity {
    if (this.snapshotCache?.index === index) return this.snapshotCache.identity
    const hash = createHash('sha256').update(
      `${index.version}\0${index.projectRoot}\0${index.builtAt}\0${index.workspaceRevision ?? 'unknown'}\0`,
    )
    for (const filePath of Object.keys(index.files).sort()) {
      hash.update(filePath).update('\0').update(index.files[filePath]!.hash)
    }
    const identity: IndexSnapshotIdentity = {
      schemaVersion: 1,
      snapshotId: hash.digest('hex'),
      indexVersion: index.version,
      builtAt: index.builtAt,
      ...(index.workspaceRevision !== undefined
        ? { workspaceRevision: index.workspaceRevision }
        : {}),
    }
    this.snapshotCache = { index, identity }
    return identity
  }

  /**
   * Embed all indexed files when semantic indexing is enabled and an embedder
   * is wired. Non-fatal: a failure here leaves lexical search fully functional.
   */
  private async _buildVectors(
    index: MetadataIndex,
    cacheDir: string,
  ): Promise<void> {
    if (!this.config.semantic?.enabled || !this.embed) return
    try {
      const fingerprint = getSemanticConfigFingerprint(
        this.config.semantic,
        this.embed,
      )
      const persisted = await loadSemanticVectors(
        this.projectRoot,
        fingerprint,
        cacheDir,
      )
      this.fileVectors = await buildFileVectors(
        Object.values(index.files),
        this.embed,
        64,
        [...this.fileVectors, ...persisted],
      )
      await saveSemanticVectors(
        this.projectRoot,
        fingerprint,
        this.fileVectors,
        cacheDir,
      )
    } catch (err) {
      console.debug('[indexer] semantic vector build failed:', err)
      this.fileVectors = []
      this.lastBuildError = createBuildError(
        'semantic',
        err,
        getIndexDir(this.projectRoot, cacheDir),
      )
    }
  }

  /** True when semantic search can run (enabled, embedder wired, vectors built). */
  isSemanticReady(): boolean {
    return Boolean(
      this.config.semantic?.enabled &&
      this.embed &&
      this.fileVectors.length > 0,
    )
  }

  getStatus(): IndexStatus {
    this.scheduleRefreshIfNeeded()
    const indexAge = this.index ? Date.now() - this.index.builtAt : 0
    const refreshing = Boolean(this.buildPromise || this.staleRefreshPending)
    const stale = Boolean(
      this.index &&
      (this.forceRefresh ||
        refreshing ||
        this.lastBuildError ||
        isIndexStale(this.index)),
    )
    const diagnostics = this.index?.parseDiagnostics ?? []
    const state: IndexStatus['state'] =
      this.config.enabled === false
        ? 'disabled'
        : !this.index
          ? refreshing
            ? 'building'
            : this.lastBuildError
              ? 'failed'
              : 'empty'
          : diagnostics.length > 0 ||
              this.lastBuildError ||
              this.index.coverage?.parser?.truncated
            ? 'degraded'
            : stale
              ? 'stale'
              : 'ready'
    const semantic: IndexStatus['semantic'] = !this.config.semantic?.enabled
      ? 'disabled'
      : this.isSemanticReady()
        ? 'ready'
        : this.embed
          ? refreshing
            ? 'building'
            : 'failed'
          : 'unavailable'
    const coverage = this.index?.coverage
    const coverageNotice = coverage?.truncated
      ? ` Index coverage is partial: walker skipped ${coverage.skippedFiles} file(s) under ${coverage.skippedPrefixes.join(', ') || 'no walker prefixes'}; parser skipped ${coverage.parser?.skippedFiles ?? 0} file(s) under ${coverage.parser?.skippedPrefixes.join(', ') || 'no parser prefixes'}.`
      : ''
    const errorNotice = this.lastBuildError
      ? ` Last ${this.lastBuildError.stage} error: ${this.lastBuildError.message}`
      : ''
    return {
      state,
      ready: Boolean(this.index),
      stale,
      refreshing,
      semantic,
      totalIndexed: this.index?.fileCount ?? 0,
      indexAge,
      diagnostics,
      coverage,
      lastBuildError: this.lastBuildError,
      message: `${state === 'ready' ? 'Index ready.' : state === 'stale' ? 'Serving a stale snapshot while refreshing.' : state === 'degraded' ? 'Index ready with partial coverage or diagnostics.' : state === 'failed' ? 'Index build failed.' : state === 'building' ? 'Index is building.' : state === 'disabled' ? 'Indexing is disabled.' : 'Index is empty or unavailable.'}${coverageNotice}${errorNotice}`,
    }
  }

  /**
   * Rank indexed files by semantic similarity to the query. Returns [] when
   * semantic indexing is unavailable, so callers can fall back to lexical-only.
   */
  async searchSemantic(
    query: string,
    limit = 20,
    fileTypes?: string[],
    pathPrefixes?: string[],
  ): Promise<SemanticHit[]> {
    if (!this.isSemanticReady() || !this.embed) return []
    try {
      const allowedVectors = this.fileVectors.filter((entry) => {
        if (
          fileTypes?.length &&
          !matchesFileTypes(this.index?.files[entry.path]?.ext, fileTypes)
        ) {
          return false
        }
        if (!pathPrefixes?.length) return true
        return pathPrefixes.some((rawPrefix) => {
          const prefix = rawPrefix
            .replace(/\\/g, '/')
            .replace(/^\.\//, '')
            .replace(/^\/+|\/+$/g, '')
          return entry.path === prefix || entry.path.startsWith(`${prefix}/`)
        })
      })
      return await semanticSearch(query, allowedVectors, this.embed, limit)
    } catch (err) {
      console.debug('[indexer] semantic search failed:', err)
      return []
    }
  }

  private scheduleRefreshIfNeeded(): void {
    if (
      !this.index ||
      (!isIndexStale(this.index) && !this.lastBuildError?.retryable) ||
      this.buildPromise ||
      this.forceRefresh ||
      Date.now() - this.lastBuildAttempt < this.MIN_RETRY_INTERVAL_MS
    ) {
      return
    }
    this.forceRefresh = true
    this.ensureBuilt()
  }
}

/**
 * Merge the project-level lexical weights from `indexing.weights.lexical` into a
 * query options object. Per-query `lexicalWeights` (if provided by the caller)
 * take precedence over the config defaults — the caller's explicit override
 * wins. Returns the options object with `lexicalWeights` populated when the
 * config defines any lexical weights and the caller did not supply its own.
 */
function withConfigLexicalWeights(
  options: QueryOptions,
  config: IndexingConfig,
): QueryOptions {
  const configLexical = config.weights?.lexical
  if (!configLexical) return options
  // Caller-supplied per-query weights take precedence over config defaults.
  if (options.lexicalWeights) return options
  return { ...options, lexicalWeights: configLexical }
}

function mergeMutationDeltas(
  current: IndexMutationDelta | undefined,
  next: IndexMutationDelta,
): IndexMutationDelta {
  const changedPaths = new Set([
    ...(current?.changedPaths ?? []),
    ...(next.changedPaths ?? []),
  ])
  const deletedPaths = new Set([
    ...(current?.deletedPaths ?? []),
    ...(next.deletedPaths ?? []),
  ])
  for (const deletedPath of deletedPaths) changedPaths.delete(deletedPath)
  return {
    changedPaths: Array.from(changedPaths),
    deletedPaths: Array.from(deletedPaths),
    complete: current
      ? current.complete === true && next.complete === true
      : next.complete,
    revision: next.revision ?? current?.revision,
  }
}

function createBuildError(
  stage: IndexBuildError['stage'],
  error: unknown,
  cachePath: string,
): IndexBuildError {
  const message = error instanceof Error ? error.message : String(error)
  return {
    stage,
    message: message.slice(0, 2_000),
    timestamp: Date.now(),
    retryable: !/refusing to use non-owned/i.test(message),
    cachePath,
  }
}

function matchesFileTypes(
  extension: string | undefined,
  fileTypes: string[],
): boolean {
  if (!extension) return false
  const normalizedExtension = extension.replace(/^\./, '').toLowerCase()
  return fileTypes.some(
    (fileType) =>
      fileType.trim().replace(/^\./, '').toLowerCase() === normalizedExtension,
  )
}
