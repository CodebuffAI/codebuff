import { IndexManager } from '@codebuff/indexer'
import { createConfiguredEmbedder, loadProviderConfigSync } from '@openbuff/sdk'

import { getProjectRoot } from '../project-files'

type IndexQueryResult = {
  results: Array<{
    path: string
    score: number
    explanation?: string
    matchedOn?: string[]
  }>
  ready: boolean
  totalIndexed: number
  indexAge: number
  status: IndexStatusView
}

type IndexStatusView = {
  state: 'disabled' | 'building' | 'ready' | 'stale' | 'degraded' | 'empty'
  ready: boolean
  stale: boolean
  refreshing: boolean
  semantic: 'disabled' | 'building' | 'ready' | 'unavailable' | 'failed'
  totalIndexed: number
  indexAge: number
  diagnostics: Array<{ filePath: string; stage: string; message: string }>
  coverage?: {
    truncated: boolean
    maxFiles: number
    skippedFiles: number
    skippedPrefixes: string[]
  }
  message: string
}

type IndexManagerLike = {
  markStale(): void
  ensureBuilt(): void
  waitUntilReady(timeoutMs?: number): Promise<void>
  query(query: string, options?: { limit?: number }): IndexQueryResult
  queryBlended(
    query: string,
    options?: { limit?: number; mode?: 'explain' },
  ): Promise<IndexQueryResult>
  isSemanticReady(): boolean
}

type IndexCommandDeps = {
  getManager: () => {
    enabled: boolean
    semanticEnabled: boolean
    manager: IndexManagerLike | null
  }
}

const defaultDeps: IndexCommandDeps = {
  getManager: () => {
    const config = loadProviderConfigSync().config.indexing
    if (config.enabled === false) {
      return { enabled: false, semanticEnabled: false, manager: null }
    }
    const embedder =
      config.semantic?.enabled && config.semantic.model
        ? (createConfiguredEmbedder(config.semantic.model) ?? undefined)
        : undefined
    return {
      enabled: true,
      semanticEnabled: config.semantic?.enabled ?? false,
      manager: IndexManager.getInstance(getProjectRoot(), config, embedder),
    }
  },
}

export async function handleIndexCommand(
  rawArgs: string,
  deps: IndexCommandDeps = defaultDeps,
): Promise<string> {
  const [subcommand = 'status', ...rest] = rawArgs.trim().split(/\s+/)
  const normalized = subcommand.toLowerCase()
  const setup = deps.getManager()

  if (!setup.enabled || !setup.manager) {
    return [
      'Index status: disabled in openbuff.json.',
      'Use read_subtree, glob, or code_search for live discovery.',
    ].join('\n')
  }

  if (normalized === 'status') {
    return formatIndexStatus(
      setup.manager.query('', { limit: 1 }),
      setup.manager.isSemanticReady(),
      setup.semanticEnabled,
    )
  }

  if (normalized === 'rebuild') {
    setup.manager.markStale()
    setup.manager.ensureBuilt()
    await setup.manager.waitUntilReady(30_000)
    const status = setup.manager.query('', { limit: 1 })
    return [
      'Index refresh requested. Compatible caches are reconciled incrementally; incompatible caches rebuild.',
      formatIndexStatus(
        status,
        setup.manager.isSemanticReady(),
        setup.semanticEnabled,
      ),
    ].join('\n')
  }

  if (normalized === 'explain') {
    const query = rest.join(' ').trim()
    if (!query) {
      return 'Usage: /index explain <query>'
    }
    await setup.manager.waitUntilReady(5_000)
    const result = await setup.manager.queryBlended(query, {
      mode: 'explain',
      limit: 10,
    })
    if (!result.ready) {
      return [
        `Index explain: index is still building (${result.totalIndexed} files known).`,
        'Retry shortly or use read_subtree, glob, or code_search now.',
      ].join('\n')
    }
    if (result.results.length === 0) {
      return `Index explain: no matches for "${query}" across ${result.totalIndexed} indexed files.`
    }
    return [
      `Index explain: "${query}" (${result.results.length} results; ${result.totalIndexed} indexed files; age ${formatAge(result.indexAge)}).`,
      ...result.results.map((item, index) => {
        const matched = item.matchedOn?.length
          ? ` matched ${item.matchedOn.join(', ')}`
          : ''
        const explanation = item.explanation ? ` — ${item.explanation}` : ''
        return `${index + 1}. ${item.path} (score ${round(item.score)};${matched.trimStart() || ' ranked match'})${explanation}`
      }),
    ].join('\n')
  }

  return 'Usage: /index [status|rebuild|explain <query>]'
}

function formatIndexStatus(
  result: IndexQueryResult,
  semanticReady: boolean,
  semanticEnabled: boolean,
): string {
  const status = result.status
  const semantic = !semanticEnabled
    ? 'disabled'
    : semanticReady
      ? 'ready'
      : `${status.semantic} (metadata-only fallback)`
  const lines = [
    `Index status: ${status.state}${status.refreshing ? ' · refreshing' : ''}.`,
    status.message,
    `Corpus: ${status.totalIndexed} indexed file${status.totalIndexed === 1 ? '' : 's'}.`,
    `Age: ${status.indexAge > 0 ? formatAge(status.indexAge) : 'not available'}.`,
    `Semantic: ${semantic}.`,
    status.ready
      ? 'Use /index explain <query> to inspect ranking provenance.'
      : 'Retry shortly, run /index rebuild, or use read_subtree/glob/code_search.',
  ]
  if (status.coverage?.truncated) {
    lines.push(
      `Coverage: partial at ${status.coverage.maxFiles} files; skipped ${status.coverage.skippedFiles} under ${status.coverage.skippedPrefixes.join(', ') || 'unknown prefixes'}.`,
    )
  }
  if (status.diagnostics.length > 0) {
    lines.push(
      `Diagnostics: ${status.diagnostics.length} parser issue${status.diagnostics.length === 1 ? '' : 's'}.`,
      ...status.diagnostics
        .slice(0, 5)
        .map(
          (diagnostic) =>
            `- ${diagnostic.filePath} (${diagnostic.stage}): ${diagnostic.message}`,
        ),
    )
  }
  return lines.join('\n')
}

function formatAge(milliseconds: number): string {
  if (milliseconds < 1_000) return '<1s'
  const seconds = Math.floor(milliseconds / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}
