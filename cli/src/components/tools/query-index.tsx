import React from 'react'

import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'

import type { ToolRenderConfig } from './types'

type QueryIndexResult = {
  path?: unknown
  score?: unknown
  matchedOn?: unknown
  relatedFiles?: unknown
  explanation?: unknown
}

type QueryIndexOutput = {
  results?: unknown
  message?: unknown
}

export const QueryIndexComponent = defineToolComponent({
  toolName: 'query_index',

  render(toolBlock): ToolRenderConfig {
    const input = toolBlock.input as Record<string, unknown> | undefined
    const query = typeof input?.query === 'string' ? input.query : ''
    const mode = typeof input?.mode === 'string' ? input.mode : 'search'
    const from = typeof input?.from === 'string' ? input.from : ''
    const to = typeof input?.to === 'string' ? input.to : ''
    const output = extractOutput(toolBlock.outputRaw ?? toolBlock.output)
    const results = extractResults(output)

    const QueryIndexContent = () => {
      const theme = useTheme()
      const description = buildDescription({ query, mode, from, to, results })
      const topResults = results.slice(0, 3)

      return (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <SimpleToolCallItem
            name="Index"
            description={description}
            descriptionColor={theme.primary}
          />
          {topResults.length > 0 ? (
            <box style={{ flexDirection: 'column', gap: 0, paddingLeft: 2 }}>
              {topResults.map((result, index) => (
                <text key={`${String(result.path)}-${index}`} style={{ wrapMode: 'word' }}>
                  <span fg={theme.muted}>{`${index + 1}. `}</span>
                  <span fg={theme.foreground}>{String(result.path)}</span>
                  {typeof result.score === 'number' ? (
                    <span fg={theme.muted}>{` (${roundScore(result.score)})`}</span>
                  ) : null}
                  {formatMatchedOn(result) ? (
                    <span fg={theme.muted}>{` · ${formatMatchedOn(result)}`}</span>
                  ) : null}
                  {formatRelated(result) ? (
                    <span fg={theme.muted}>{` · ${formatRelated(result)}`}</span>
                  ) : null}
                  {typeof result.explanation === 'string' && result.explanation.length > 0 ? (
                    <span fg={theme.muted}>{` — ${truncate(result.explanation, 120)}`}</span>
                  ) : null}
                </text>
              ))}
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

function formatRelated(result: QueryIndexResult): string {
  if (!Array.isArray(result.relatedFiles) || result.relatedFiles.length === 0) {
    return ''
  }
  const first = result.relatedFiles.find(isRecord)
  if (!first || typeof first.path !== 'string') return ''
  const reason = typeof first.reason === 'string' ? `: ${first.reason}` : ''
  return `related to ${first.path}${reason}`
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
