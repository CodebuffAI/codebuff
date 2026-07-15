import { TextAttributes } from '@opentui/core'

import { DiffViewer } from './diff-viewer'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import {
  getCanonicalMutationResult,
  getStructuredErrorMessages,
} from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig, ToolBlock } from './types'

type TransactionFile = {
  path: string
  destinationPath?: string
  diff: string | null
}

// Mirrors the `queued` distinction in str-replace.tsx: a write tool call that
// is waiting on a prior same-path write (or the custom-tool barrier for
// multi-path transactions) shows "queued" instead of "pending" until its
// per-path barrier resolves and a `tool_start` event flips `queued` to false.
function isQueued(toolBlock: ToolBlock): boolean {
  const hasOutput =
    toolBlock.outputRaw !== undefined ||
    (typeof toolBlock.output === 'string' && toolBlock.output.trim().length > 0)
  return !hasOutput && toolBlock.queued === true
}

function getTransactionValue(
  toolBlock: ToolBlock,
): Record<string, unknown> | null {
  const outputRaw = toolBlock.outputRaw
  if (Array.isArray(outputRaw) && outputRaw[0]?.value) {
    return outputRaw[0].value as Record<string, unknown>
  }
  if (typeof outputRaw === 'object' && outputRaw !== null) {
    return outputRaw as Record<string, unknown>
  }
  return null
}

function getTransactionFiles(toolBlock: ToolBlock): TransactionFile[] {
  const canonical = getCanonicalMutationResult(toolBlock.outputRaw)
  if (canonical && Array.isArray(canonical.actions)) {
    return canonical.actions.map((raw) => {
      const action = raw as Record<string, unknown>
      return {
        path: String(action.path),
        destinationPath:
          typeof action.destinationPath === 'string'
            ? action.destinationPath
            : undefined,
        diff: typeof action.patch === 'string' ? action.patch : null,
      }
    })
  }
  const value = getTransactionValue(toolBlock)
  if (!value || !Array.isArray(value.files)) return []

  return value.files
    .map((file) => {
      const entry = file as Record<string, unknown>
      const path =
        typeof entry.path === 'string'
          ? entry.path
          : typeof entry.file === 'string'
            ? entry.file
            : ''
      if (!path) return null
      const diff =
        typeof entry.patch === 'string'
          ? entry.patch
          : typeof entry.unifiedDiff === 'string'
            ? entry.unifiedDiff
            : null
      return { path, diff }
    })
    .filter((entry): entry is TransactionFile => Boolean(entry))
}

function getTransactionError(toolBlock: ToolBlock): string | null {
  const value = getTransactionValue(toolBlock)
  if (value && typeof value.errorMessage === 'string') return value.errorMessage
  if (value && typeof value.error === 'string') return value.error
  const errors = getStructuredErrorMessages(toolBlock.outputRaw)
  return errors.length > 0 ? errors.join('\n') : null
}

function getTransactionRows(toolBlock: ToolBlock): string[] {
  const canonical = getCanonicalMutationResult(toolBlock.outputRaw)
  if (canonical && Array.isArray(canonical.actions)) {
    return canonical.actions.map((raw) => {
      const action = raw as Record<string, unknown>
      const rollback = action.rollback as Record<string, unknown> | undefined
      const error = action.error as Record<string, unknown> | undefined
      const pathLabel =
        action.action === 'move' && typeof action.destinationPath === 'string'
          ? `${String(action.path)} → ${action.destinationPath}`
          : String(action.path)
      return `${String(action.index)}. ${pathLabel} • ${String(action.action)} • ${String(action.outcome)}${rollback?.attempted ? ` • rollback ${rollback.succeeded ? 'succeeded' : 'failed'}` : ''}${error?.message ? ` • ${String(error.message)}` : ''}`
    })
  }
  const value = getTransactionValue(toolBlock)
  if (!value || !Array.isArray(value.failures)) return []
  return value.failures.map((raw) => {
    const failure = raw as Record<string, unknown>
    const editNumber =
      typeof failure.editIndex === 'number' && failure.editIndex >= 0
        ? failure.editIndex + 1
        : '?'
    return `${String(editNumber)}. ${String(failure.path ?? failure.id ?? 'unknown')} • ${String(failure.errorMessage ?? failure.error ?? 'failed')}`
  })
}

const TransactionHeader = ({
  name,
  queued,
}: {
  name: string
  queued: boolean
}) => {
  const theme = useTheme()
  return (
    <text style={{ wrapMode: 'word' }}>
      <span fg={theme.foreground}>• </span>
      <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
        {name}
      </span>
      {queued ? <span fg={theme.muted}>{' queued'}</span> : null}
    </text>
  )
}

export const EditTransactionComponent = defineToolComponent({
  toolName: 'edit_transaction',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const files = getTransactionFiles(toolBlock)
    const error = getTransactionError(toolBlock)
    const rows = getTransactionRows(toolBlock)
    const queued = isQueued(toolBlock)
    const mutation = getCanonicalMutationResult(toolBlock.outputRaw)
    const title = 'Edit transaction'
    const collapsedPreview = error
      ? error.split('\n')[0]
      : files.length > 0
        ? `${title} • ${files.length} file${files.length === 1 ? '' : 's'}`
        : queued
          ? `${title} queued...`
          : `${title} pending...`

    return {
      collapsedPreview,
      content: (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <TransactionHeader
            name={`${title}${toolBlock.lifecycle === 'cancelled' ? ' cancelled' : mutation ? ` ${String(mutation.outcome)}` : ''}`}
            queued={queued}
          />
          {error ? (
            <box style={{ paddingLeft: 2, width: '100%' }}>
              <text style={{ wrapMode: 'word' }}>{error}</text>
            </box>
          ) : null}
          {rows.map((row, index) => (
            <text
              key={`${index}-${row}`}
              fg={_theme.muted}
              style={{ wrapMode: 'word' }}
            >
              {row}
            </text>
          ))}
          {files.map((file) => (
            <box
              key={file.path}
              style={{ flexDirection: 'column', paddingLeft: 2, width: '100%' }}
            >
              <text style={{ wrapMode: 'word' }}>{file.path}</text>
              {file.diff ? (
                <DiffViewer
                  diffText={file.diff}
                  availableWidth={Math.max(10, options.availableWidth - 4)}
                />
              ) : null}
            </box>
          ))}
        </box>
      ),
    }
  },
})
