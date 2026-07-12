import React from 'react'

import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { wrapTextPreservingNewlines } from '../../utils/text-layout'
import { getStructuredErrorMessages } from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig, ToolRenderOptions } from './types'

type QueryIndexResult = {
  path?: unknown
  score?: unknown
  matchedOn?: unknown
  matchedSnippets?: unknown
  relatedFiles?: unknown
  explanation?: unknown
}

type QueryIndexOutput = {
  results?: unknown
  message?: unknown
  totalIndexed?: unknown
  indexAge?: unknown
  status?: unknown
}

type StructuredIndexStatus = {
  state: string
  ready?: boolean
  stale?: boolean
  refreshing?: boolean
  semantic?: string
  diagnostics?: Array<{ filePath?: string; stage?: string; message?: string }>
  coverage?: {
    truncated?: boolean
    maxFiles?: number
    skippedFiles?: number
    skippedPrefixes?: string[]
  }
  message?: string
}

/** Horizontal padding applied by the surrounding tool body indent. */
const INDENT_LEFT = 2
/** Extra indent applied to the per-result details/explanation rows. */
const DETAIL_INDENT = 3
/** Width reserved for the leading numeric prefix (e.g. "1. "). */
const NUMBER_PREFIX_WIDTH = 3

export const QueryIndexComponent = defineToolComponent({
  toolName: 'query_index',

  render(toolBlock, _theme, options: ToolRenderOptions): ToolRenderConfig {
    const input = toolBlock.input as Record<string, unknown> | undefined
    const query = typeof input?.query === 'string' ? input.query : ''
    const mode = typeof input?.mode === 'string' ? input.mode : 'search'
    const from = typeof input?.from === 'string' ? input.from : ''
    const to = typeof input?.to === 'string' ? input.to : ''
    const output = extractOutput(toolBlock.outputRaw ?? toolBlock.output)
    const results = extractResults(output)
    const error = getStructuredErrorMessages(
      toolBlock.outputRaw ?? toolBlock.output,
    )[0]
    const status = getIndexStatus({
      lifecycle: toolBlock.lifecycle,
      output,
      error,
      resultCount: results.length,
    })
    const availableWidth = Math.max(20, options?.availableWidth ?? 80)
    const headerDescriptionWidth = Math.max(
      10,
      availableWidth - INDENT_LEFT - 8,
    )
    const pathColWidth = Math.max(
      10,
      availableWidth - INDENT_LEFT - NUMBER_PREFIX_WIDTH,
    )
    const detailColWidth = Math.max(
      10,
      availableWidth - INDENT_LEFT - DETAIL_INDENT,
    )

    const QueryIndexContent = () => {
      const theme = useTheme()
      const description = wrapTextPreservingNewlines(
        buildDescription({ query, mode, from, to, results, status }),
        headerDescriptionWidth,
      )
      const message =
        typeof output?.message === 'string' ? output.message.trim() : ''
      const totalIndexed =
        typeof output?.totalIndexed === 'number' ? output.totalIndexed : null
      const indexAge =
        typeof output?.indexAge === 'number' ? output.indexAge : null
      const structuredStatus = extractStructuredStatus(output?.status)
      const diagnostics = structuredStatus?.diagnostics ?? []
      const coverage = structuredStatus?.coverage

      return (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <SimpleToolCallItem
            name="Index"
            description={description}
            descriptionColor={theme.primary}
          />
          <box
            style={{
              flexDirection: 'column',
              gap: 0,
              paddingLeft: INDENT_LEFT,
              width: '100%',
            }}
          >
            <text style={{ wrapMode: 'word' }}>
              <span fg={theme.muted}>Status: </span>
              <span fg={error ? theme.error : theme.foreground}>{status}</span>
            </text>
            {totalIndexed !== null ? (
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.muted}>
                  {`Corpus: ${totalIndexed} indexed file${totalIndexed === 1 ? '' : 's'}${indexAge === null ? '' : ` · age ${formatAge(indexAge)}`}`}
                </span>
              </text>
            ) : null}
            {error || message ? (
              <text style={{ wrapMode: 'word' }}>
                <span fg={error ? theme.error : theme.muted}>
                  {wrapTextPreservingNewlines(error ?? message, detailColWidth)}
                </span>
              </text>
            ) : null}
            {structuredStatus?.semantic ? (
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.muted}>{`Semantic: ${structuredStatus.semantic}`}</span>
              </text>
            ) : null}
            {coverage?.truncated ? (
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.warning}>
                  {wrapTextPreservingNewlines(
                    `Partial coverage at ${coverage.maxFiles ?? 'configured limit'} files; skipped ${coverage.skippedFiles ?? 'unknown'} under ${(coverage.skippedPrefixes ?? []).join(', ') || 'unknown prefixes'}.`,
                    detailColWidth,
                  )}
                </span>
              </text>
            ) : null}
            {diagnostics.slice(0, 5).map((diagnostic, index) => (
              <text key={`diagnostic-${index}`} style={{ wrapMode: 'word' }}>
                <span fg={theme.warning}>
                  {wrapTextPreservingNewlines(
                    `Diagnostic: ${diagnostic.filePath ?? 'unknown file'} (${diagnostic.stage ?? 'parse'}): ${diagnostic.message ?? 'unknown parser error'}`,
                    detailColWidth,
                  )}
                </span>
              </text>
            ))}
            {results.length > 3 ? (
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.muted}>
                  {`${results.length - 3} additional result${results.length - 3 === 1 ? '' : 's'} shown below.`}
                </span>
              </text>
            ) : null}
          </box>
          {results.length > 0 ? (
            <box
              style={{
                flexDirection: 'column',
                gap: 0,
                paddingLeft: INDENT_LEFT,
                width: '100%',
              }}
            >
              {results.map((result, index) => {
                const details = [
                  typeof result.score === 'number'
                    ? `score ${roundScore(result.score)}`
                    : '',
                  formatMatchedOn(result)
                    ? `matched: ${formatMatchedOn(result)}`
                    : '',
                ].filter(Boolean)
                const snippet = formatSnippets(result)
                const related = formatRelated(result)

                const pathDisplay = wrapTextPreservingNewlines(
                  String(result.path),
                  pathColWidth,
                )
                const detailsDisplay =
                  details.length > 0
                    ? wrapTextPreservingNewlines(
                        details.join(' · '),
                        detailColWidth,
                      )
                    : ''
                const snippetDisplay = snippet
                  ? wrapTextPreservingNewlines(snippet, detailColWidth)
                  : ''
                const relatedDisplay = related
                  ? wrapTextPreservingNewlines(related, detailColWidth)
                  : ''
                const explanation =
                  typeof result.explanation === 'string' &&
                  result.explanation.length > 0
                    ? wrapTextPreservingNewlines(
                        truncate(result.explanation, 160),
                        detailColWidth,
                      )
                    : ''

                return (
                  <box
                    key={`${String(result.path)}-${index}`}
                    style={{ flexDirection: 'column', gap: 0, width: '100%' }}
                  >
                    <text style={{ wrapMode: 'word' }}>
                      <span fg={theme.muted}>{`${index + 1}. `}</span>
                      <span fg={theme.foreground}>{pathDisplay}</span>
                    </text>
                    {detailsDisplay ? (
                      <text
                        style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}
                      >
                        <span fg={theme.muted}>{detailsDisplay}</span>
                      </text>
                    ) : null}
                    {snippetDisplay ? (
                      <text
                        style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}
                      >
                        <span fg={theme.muted}>{snippetDisplay}</span>
                      </text>
                    ) : null}
                    {relatedDisplay ? (
                      <text
                        style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}
                      >
                        <span fg={theme.muted}>{relatedDisplay}</span>
                      </text>
                    ) : null}
                    {explanation ? (
                      <text
                        style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}
                      >
                        <span fg={theme.muted}>{explanation}</span>
                      </text>
                    ) : null}
                  </box>
                )
              })}
            </box>
          ) : null}
        </box>
      )
    }

    return {
      collapsedPreview: buildDescription({
        query,
        mode,
        from,
        to,
        results,
        status,
      }),
      content: <QueryIndexContent />,
    }
  },
})

function extractOutput(output: unknown): QueryIndexOutput | undefined {
  const outputArray = Array.isArray(output) ? output : [output]
  for (const item of outputArray) {
    if (isRecord(item) && item.type === 'json' && isRecord(item.value)) {
      return item.value as QueryIndexOutput
    }
    if (isRecord(item) && Array.isArray(item.results)) {
      return item as QueryIndexOutput
    }
  }
  return undefined
}

function extractResults(
  output: QueryIndexOutput | undefined,
): QueryIndexResult[] {
  if (!Array.isArray(output?.results)) return []
  return output.results.filter(
    (result) => isRecord(result) && typeof result.path === 'string',
  ) as QueryIndexResult[]
}

function buildDescription(input: {
  query: string
  mode: string
  from: string
  to: string
  results: QueryIndexResult[]
  status: string
}): string {
  const target =
    input.mode === 'path'
      ? `${input.from || 'auto'} → ${input.to || 'auto'}`
      : input.mode === 'neighbors'
        ? input.from || input.query || 'auto'
        : input.query || input.from || 'index'
  const count = input.results.length
  return `${input.mode}: ${target} (${count} result${count === 1 ? '' : 's'}) · ${input.status}`
}

function getIndexStatus(input: {
  lifecycle?: string
  output?: QueryIndexOutput
  error?: string
  resultCount: number
}): string {
  if (input.error) return 'failed'
  if (input.lifecycle === 'queued') return 'queued'
  if (input.lifecycle === 'running' || !input.output) return 'building'
  if (input.lifecycle === 'cancelled') return 'cancelled'

  const structured = extractStructuredStatus(input.output.status)
  if (structured) {
    return `${structured.state}${structured.refreshing ? ' · refreshing' : ''}`
  }

  const message =
    typeof input.output.message === 'string'
      ? input.output.message.toLowerCase()
      : ''
  if (message.includes('disabled')) return 'disabled'
  if (message.includes('still building')) return 'building'
  if (message.includes('unavailable')) return 'unavailable'
  if (input.resultCount === 0) return 'ready · no matches'
  if (message.includes('metadata-only')) return 'ready · metadata-only fallback'
  return 'ready'
}

function extractStructuredStatus(value: unknown): StructuredIndexStatus | null {
  if (!isRecord(value) || typeof value.state !== 'string') return null
  const diagnostics = Array.isArray(value.diagnostics)
    ? value.diagnostics.filter(isRecord).map((diagnostic) => ({
        filePath:
          typeof diagnostic.filePath === 'string'
            ? diagnostic.filePath
            : undefined,
        stage:
          typeof diagnostic.stage === 'string' ? diagnostic.stage : undefined,
        message:
          typeof diagnostic.message === 'string'
            ? diagnostic.message
            : undefined,
      }))
    : undefined
  const rawCoverage = isRecord(value.coverage) ? value.coverage : undefined
  return {
    state: value.state,
    ready: typeof value.ready === 'boolean' ? value.ready : undefined,
    stale: typeof value.stale === 'boolean' ? value.stale : undefined,
    refreshing:
      typeof value.refreshing === 'boolean' ? value.refreshing : undefined,
    semantic:
      typeof value.semantic === 'string' ? value.semantic : undefined,
    diagnostics,
    coverage: rawCoverage
      ? {
          truncated:
            typeof rawCoverage.truncated === 'boolean'
              ? rawCoverage.truncated
              : undefined,
          maxFiles:
            typeof rawCoverage.maxFiles === 'number'
              ? rawCoverage.maxFiles
              : undefined,
          skippedFiles:
            typeof rawCoverage.skippedFiles === 'number'
              ? rawCoverage.skippedFiles
              : undefined,
          skippedPrefixes: Array.isArray(rawCoverage.skippedPrefixes)
            ? rawCoverage.skippedPrefixes.filter(
                (prefix): prefix is string => typeof prefix === 'string',
              )
            : undefined,
        }
      : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
  }
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

function formatMatchedOn(result: QueryIndexResult): string {
  return Array.isArray(result.matchedOn)
    ? result.matchedOn.filter((item) => typeof item === 'string').join(', ')
    : ''
}

function formatSnippets(result: QueryIndexResult): string {
  if (
    !Array.isArray(result.matchedSnippets) ||
    result.matchedSnippets.length === 0
  ) {
    return ''
  }
  const first = result.matchedSnippets.find((item) => typeof item === 'string')
  if (typeof first !== 'string') return ''
  const snippet = truncate(first, 80)
  return /^snippet\s*:/i.test(snippet) ? snippet : `snippet: ${snippet}`
}

function formatRelated(result: QueryIndexResult): string {
  if (!Array.isArray(result.relatedFiles) || result.relatedFiles.length === 0) {
    return ''
  }
  const first = result.relatedFiles.find(isRecord)
  if (!first || typeof first.path !== 'string') return ''
  const reason = typeof first.reason === 'string' ? `: ${first.reason}` : ''
  return truncate(`related to ${first.path}${reason}`, 120)
}

function roundScore(score: number): string {
  return (Math.round(score * 100) / 100).toString()
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
