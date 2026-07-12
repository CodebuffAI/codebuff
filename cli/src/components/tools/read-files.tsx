import { useState } from 'react'
import { TextAttributes } from '@opentui/core'

import { Button } from '../button'
import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import {
  isEnvTemplateFile,
  isSensitiveFile,
} from '../../utils/create-run-config'
import {
  findToolResultByKind,
  getStructuredErrorMessages,
} from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig } from './types'

type ReadSelector = { path: string; label: string }

export const READ_DIAGNOSTIC_MAX_ROWS = 20
export const READ_DIAGNOSTIC_MAX_MESSAGE_LINES = 6

function ReadDiagnostics({ outputRaw }: { outputRaw: unknown }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const result = findToolResultByKind(outputRaw, 'read_files_result')
  if (!result || !Array.isArray(result.results)) return null
  const rows = result.results as Array<Record<string, unknown>>
  const summary =
    result.summary && typeof result.summary === 'object'
      ? (result.summary as Record<string, unknown>)
      : null
  const visible = expanded ? rows : rows.slice(0, READ_DIAGNOSTIC_MAX_ROWS)

  return (
    <box style={{ flexDirection: 'column', paddingLeft: 2, width: '100%' }}>
      {summary ? (
        <text fg={theme.muted}>
          {`${String(summary.ok ?? 0)}/${String(summary.requested ?? rows.length)} complete · ${String(summary.partial ?? 0)} partial · ${String(summary.failed ?? 0)} failed`}
        </text>
      ) : null}
      {visible.map((row, index) => {
        const error =
          row.error && typeof row.error === 'object'
            ? (row.error as Record<string, unknown>)
            : null
        const details = [
          row.status === 'error' ? error?.code : row.status,
          row.selector,
          row.selector === 'range'
            ? `${row.startLine ?? '?'}-${row.endLine ?? '?'}`
            : null,
          Array.isArray(row.missingSymbols) && row.missingSymbols.length > 0
            ? `missing: ${row.missingSymbols.join(', ')}`
            : null,
          error?.retryable === true ? 'retryable' : null,
          error?.recovery ? recoveryLabel(String(error.recovery)) : null,
        ].filter(Boolean)
        const message = typeof error?.message === 'string' ? error.message : ''
        const messageLines = message.split('\n')
        const shownMessage = expanded
          ? message
          : messageLines.slice(0, READ_DIAGNOSTIC_MAX_MESSAGE_LINES).join('\n')
        return (
          <box
            key={`${String(row.path)}-${index}`}
            style={{ flexDirection: 'column' }}
          >
            <text fg={row.status === 'error' ? theme.error : theme.muted}>
              {`${row.status === 'error' ? '✗' : row.status === 'partial' ? '◐' : '✓'} ${String(row.path)} • ${details.join(' • ')}`}
            </text>
            {shownMessage ? <text fg={theme.muted}>{shownMessage}</text> : null}
          </box>
        )
      })}
      {!expanded && rows.length > READ_DIAGNOSTIC_MAX_ROWS ? (
        <text
          fg={theme.muted}
        >{`… ${rows.length - READ_DIAGNOSTIC_MAX_ROWS} selector results hidden`}</text>
      ) : null}
      {rows.length > READ_DIAGNOSTIC_MAX_ROWS ||
      getStructuredErrorMessages(outputRaw).some(
        (message) =>
          message.split('\n').length > READ_DIAGNOSTIC_MAX_MESSAGE_LINES,
      ) ? (
        <Button onClick={() => setExpanded((value) => !value)}>
          <text fg={theme.muted}>
            {expanded ? 'Show less' : 'Show details'}
          </text>
        </Button>
      ) : null}
    </box>
  )
}

function recoveryLabel(recovery: string): string {
  const labels: Record<string, string> = {
    discover_path: 'Discover the correct path',
    read_again: 'Re-read',
    read_smaller_range: 'Read a smaller range',
    choose_symbol: 'Choose another symbol',
    change_edit_strategy: 'Use another edit strategy',
    use_supported_encoding: 'Convert or choose a supported text encoding',
    retry: 'Retry',
  }
  return labels[recovery] ?? recovery.replaceAll('_', ' ')
}

function FilePathsDescription({ selectors }: { selectors: ReadSelector[] }) {
  const theme = useTheme()

  return (
    <>
      {selectors.map(({ path, label }, idx) => {
        const isLast = idx === selectors.length - 1
        const separator = isLast ? '' : ', '

        if (isSensitiveFile(path)) {
          return (
            <span key={label}>
              <span fg={theme.muted} attributes={TextAttributes.STRIKETHROUGH}>
                {label}
              </span>
              <span fg={theme.muted}> (blocked)</span>
              <span fg={theme.foreground}>{separator}</span>
            </span>
          )
        }

        if (isEnvTemplateFile(path)) {
          return (
            <span key={label}>
              <span fg={theme.foreground}>{label}</span>
              <span fg={theme.muted}> (allowed - example only)</span>
              <span fg={theme.foreground}>{separator}</span>
            </span>
          )
        }

        return (
          <span key={label} fg={theme.foreground}>
            {label}
            {separator}
          </span>
        )
      })}
    </>
  )
}

function getReadSelectors(input: unknown): ReadSelector[] {
  if (!input || typeof input !== 'object') return []
  const record = input as Record<string, unknown>
  const selectors: ReadSelector[] = []

  for (const path of Array.isArray(record.paths) ? record.paths : []) {
    if (typeof path === 'string' && path.trim()) {
      selectors.push({ path: path.trim(), label: path.trim() })
    }
  }
  for (const range of Array.isArray(record.ranges) ? record.ranges : []) {
    if (!range || typeof range !== 'object') continue
    const value = range as Record<string, unknown>
    if (typeof value.path !== 'string' || !value.path.trim()) continue
    const start = typeof value.startLine === 'number' ? value.startLine : ''
    const end = typeof value.endLine === 'number' ? value.endLine : ''
    selectors.push({
      path: value.path.trim(),
      label: `${value.path.trim()}:${start}-${end}`,
    })
  }
  for (const symbol of Array.isArray(record.symbols) ? record.symbols : []) {
    if (!symbol || typeof symbol !== 'object') continue
    const value = symbol as Record<string, unknown>
    if (typeof value.path !== 'string' || !value.path.trim()) continue
    const names = Array.isArray(value.names)
      ? value.names.filter((name): name is string => typeof name === 'string')
      : []
    selectors.push({
      path: value.path.trim(),
      label: `${value.path.trim()}#${names.join('|') || '(symbols)'}`,
    })
  }
  return selectors.filter(
    (selector, index) =>
      selectors.findIndex((candidate) => candidate.label === selector.label) ===
      index,
  )
}

function getReadStatus(toolBlock: {
  outputRaw?: unknown
  output?: unknown
  queued?: boolean
  lifecycle?: string
}): 'queued' | 'pending' | 'read' | 'partial' | 'failed' {
  if (toolBlock.lifecycle === 'cancelled') return 'failed'
  if (toolBlock.lifecycle === 'failed') return 'failed'
  const hasOutput =
    toolBlock.outputRaw !== undefined ||
    (typeof toolBlock.output === 'string' && toolBlock.output.trim().length > 0)
  if (!hasOutput) return toolBlock.queued === true ? 'queued' : 'pending'

  const rawValues =
    toolBlock.outputRaw === undefined
      ? [toolBlock.output]
      : Array.isArray(toolBlock.outputRaw)
        ? toolBlock.outputRaw.map((part) =>
            part && typeof part === 'object' && 'value' in part
              ? (part as { value?: unknown }).value
              : part,
          )
        : [toolBlock.outputRaw]

  for (const value of rawValues) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).kind === 'read_files_result'
    ) {
      const canonical = value as Record<string, unknown>
      if (canonical.version !== 1) return 'failed'
      if (canonical.status === 'ok') return 'read'
      if (canonical.status === 'partial') return 'partial'
      return 'failed'
    }
  }
  let successes = 0
  let failures = 0

  const isFailureText = (value: string) =>
    /^\s*(?:error|failed|failure|blocked)\b/i.test(value) ||
    /^\s*\[(?:FILE_DOES_NOT_EXIST|BLOCKED|FILE_OUTSIDE_PROJECT|FILE_TOO_LARGE|FILE_READ_ERROR)\]/.test(
      value,
    )

  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 6 || value === null || value === undefined) return
    if (typeof value === 'string') {
      if (isFailureText(value)) failures += 1
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) inspect(item, depth + 1)
      return
    }
    if (typeof value !== 'object') return

    const record = value as Record<string, unknown>
    const summary = record.summary
    if (summary && typeof summary === 'object') {
      const counts = summary as Record<string, unknown>
      if (typeof counts.ok === 'number' && counts.ok > 0) successes += 1
      if (typeof counts.failed === 'number' && counts.failed > 0) failures += 1
    }
    if (
      record.success === false ||
      record.status === 'failed' ||
      record.status === 'error' ||
      typeof record.errorMessage === 'string' ||
      record.error !== undefined
    ) {
      failures += 1
    }

    if (typeof record.content === 'string') {
      if (isFailureText(record.content)) failures += 1
      else successes += 1
    }
    if (Array.isArray(record.slices)) {
      if (record.slices.length > 0) successes += 1
      else failures += 1
    }

    for (const [key, nested] of Object.entries(record)) {
      if (
        key === 'summary' ||
        key === 'content' ||
        key === 'slices' ||
        key === 'errorMessage' ||
        key === 'error'
      ) {
        continue
      }
      inspect(nested, depth + 1)
    }
  }

  for (const value of rawValues) inspect(value)
  if (failures > 0 && successes > 0) return 'partial'
  if (failures > 0 || successes === 0) return 'failed'
  return 'read'
}

/**
 * UI component for read_files tool.
 * Displays file paths with labels for blocked/template files.
 */
export const ReadFilesComponent = defineToolComponent({
  toolName: 'read_files',

  render(toolBlock): ToolRenderConfig {
    const selectors = getReadSelectors(toolBlock.input)

    if (selectors.length === 0) {
      return { content: null }
    }
    const status = getReadStatus(toolBlock)

    // Check if any files need special labels
    const hasSpecialFiles = selectors.some(
      ({ path }) => isSensitiveFile(path) || isEnvTemplateFile(path),
    )

    return {
      content: (
        <box style={{ flexDirection: 'column', width: '100%' }}>
          <SimpleToolCallItem
            name={
              toolBlock.lifecycle === 'cancelled'
                ? 'Read cancelled'
                : status === 'read'
                  ? 'Read'
                  : `Read ${status}`
            }
            description={
              hasSpecialFiles ? (
                <FilePathsDescription selectors={selectors} />
              ) : (
                selectors.map(({ label }) => label).join(', ')
              )
            }
          />
          <ReadDiagnostics outputRaw={toolBlock.outputRaw} />
        </box>
      ),
    }
  },
})
