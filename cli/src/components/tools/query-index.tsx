import React from 'react'

import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { wrapTextPreservingNewlines } from '../../utils/text-layout'

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
    const availableWidth = Math.max(20, options?.availableWidth ?? 80)
    const headerDescriptionWidth = Math.max(10, availableWidth - INDENT_LEFT - 8)
    const pathColWidth = Math.max(10, availableWidth - INDENT_LEFT - NUMBER_PREFIX_WIDTH)
    const detailColWidth = Math.max(10, availableWidth - INDENT_LEFT - DETAIL_INDENT)

    const QueryIndexContent = () => {
      const theme = useTheme()
      const description = wrapTextPreservingNewlines(
        buildDescription({ query, mode, from, to, results }),
        headerDescriptionWidth,
      )
      const topResults = results.slice(0, 3)

      return (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <SimpleToolCallItem
            name="Index"
            description={description}
            descriptionColor={theme.primary}
          />
          {topResults.length > 0 ? (
            <box style={{ flexDirection: 'column', gap: 0, paddingLeft: INDENT_LEFT, width: '100%' }}>
              {topResults.map((result, index) => {
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
                    ? wrapTextPreservingNewlines(details.join(' · '), detailColWidth)
                    : ''
                const snippetDisplay = snippet
                  ? wrapTextPreservingNewlines(snippet, detailColWidth)
                  : ''
                const relatedDisplay = related
                  ? wrapTextPreservingNewlines(related, detailColWidth)
                  : ''
                const explanation =
                  typeof result.explanation === 'string' && result.explanation.length > 0
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
                      <text style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}>
                        <span fg={theme.muted}>{detailsDisplay}</span>
                      </text>
                    ) : null}
                    {snippetDisplay ? (
                      <text style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}>
                        <span fg={theme.muted}>{snippetDisplay}</span>
                      </text>
                    ) : null}
                    {relatedDisplay ? (
                      <text style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}>
                        <span fg={theme.muted}>{relatedDisplay}</span>
                      </text>
                    ) : null}
                    {explanation ? (
                      <text style={{ wrapMode: 'word', marginLeft: DETAIL_INDENT }}>
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

function extractResults(output: QueryIndexOutput | undefined): QueryIndexResult[] {
  if (!Array.isArray(output?.results)) return []
  return output.results
    .filter((result) => isRecord(result) && typeof result.path === 'string') as QueryIndexResult[]
}

function buildDescription(input: {
  query: string
  mode: string
  from: string
  to: string
  results: QueryIndexResult[]
}): string {
  const target = input.mode === 'path'
    ? `${input.from || 'auto'} → ${input.to || 'auto'}`
    : input.mode === 'neighbors'
      ? input.from || input.query || 'auto'
      : input.query || input.from || 'index'
  const count = input.results.length
  return `${input.mode}: ${target} (${count} result${count === 1 ? '' : 's'})`
}

function formatMatchedOn(result: QueryIndexResult): string {
  return Array.isArray(result.matchedOn)
    ? result.matchedOn.filter((item) => typeof item === 'string').join(', ')
    : ''
}

function formatSnippets(result: QueryIndexResult): string {
  if (!Array.isArray(result.matchedSnippets) || result.matchedSnippets.length === 0) {
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
