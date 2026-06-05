import { buildMetadataIndex, updateMetadataIndex } from './metadata-indexer'
import { isIndexReady, isIndexStale, loadIndex, saveIndex } from './index-store'
import { queryIndex } from './query'
import type { IndexingConfig, MetadataIndex, QueryIndexResult } from './types'

export class IndexManager {
  private static instances = new Map<string, IndexManager>()

  private index: MetadataIndex | null = null
  private buildPromise: Promise<void> | null = null
  private lastBuildAttempt = 0
  private readonly MIN_RETRY_INTERVAL_MS = 30_000

  private constructor(
    private readonly projectRoot: string,
    private readonly config: IndexingConfig,
  ) {}

  static getInstance(projectRoot: string, config: IndexingConfig = {}): IndexManager {
    const key = IndexManager.getInstanceKey(projectRoot, config)
    let instance = IndexManager.instances.get(key)
    if (!instance) {
      instance = new IndexManager(projectRoot, config)
      IndexManager.instances.set(key, instance)
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
    })
  }

  /**
   * Start building the index in the background. Safe to call multiple times.
   * Returns immediately without blocking.
   */
  ensureBuilt(): void {
    if (this.config.enabled === false) return
    if (this.config.semantic?.enabled) {
      console.debug(
        '[indexer] semantic indexing is configured but not implemented yet; using metadata index only.',
      )
    }
    if (this.buildPromise) return
    if (Date.now() - this.lastBuildAttempt < this.MIN_RETRY_INTERVAL_MS) return
    this.buildPromise = this._build().finally(() => {
      this.buildPromise = null
    })
  }

  /**
   * Wait for the index to be ready (up to timeoutMs).
   * Starts a build if needed.
   */
  async waitUntilReady(timeoutMs = 30_000): Promise<void> {
    if (isIndexReady(this.index) && !isIndexStale(this.index)) return
    this.ensureBuilt()
    if (!this.buildPromise) return
    await Promise.race([
      this.buildPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  }

  /**
   * Query the index. Returns empty results if index is not yet ready.
   */
  query(
    query: string,
    options: { limit?: number; fileTypes?: string[] } = {},
  ): { results: QueryIndexResult[]; ready: boolean; totalIndexed: number; indexAge: number } {
    if (this.config.enabled === false) {
      return { results: [], ready: false, totalIndexed: 0, indexAge: 0 }
    }
    if (!isIndexReady(this.index)) {
      this.ensureBuilt()
      return { results: [], ready: false, totalIndexed: 0, indexAge: 0 }
    }
    const results = queryIndex(this.index, query, options)
    return {
      results,
      ready: true,
      totalIndexed: this.index.fileCount,
      indexAge: Date.now() - this.index.builtAt,
    }
  }

  private async _build(): Promise<void> {
    if (this.config.enabled === false) return
    this.lastBuildAttempt = Date.now()
    const cacheDir = this.config.cacheDir ?? '.codebuff-index'
    try {
      const existing = await loadIndex(this.projectRoot, cacheDir)
      let index: MetadataIndex
      if (existing && !isIndexStale(existing)) {
        index = await updateMetadataIndex(existing, this.projectRoot, this.config)
      } else {
        index = await buildMetadataIndex(this.projectRoot, this.config)
      }
      await saveIndex(index, this.projectRoot, cacheDir)
      this.index = index
    } catch (err) {
      // Index build failures are never fatal
      console.debug('[indexer] build failed:', err)
    }
  }
}
