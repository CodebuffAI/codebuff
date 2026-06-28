import { TextAttributes } from '@opentui/core'

import { DiffViewer } from './diff-viewer'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import {
  extractDiff,
  extractFilePath,
  isCreateFile,
  shouldShowEditDiff,
} from '../../utils/implementor-helpers'

import type { ToolRenderConfig } from './types'

interface EditHeaderProps {
  name: string
  filePath: string | null
  status: EditStatus
  stats: DiffStats
}

type EditStatus = 'queued' | 'pending' | 'applied' | 'failed'

type DiffStats = {
  added: number
  removed: number
}

const statusLabel: Record<EditStatus, string> = {
  queued: 'queued',
  pending: 'pending',
  applied: 'applied',
  failed: 'failed',
}

const EditHeader = ({ name, filePath, status, stats }: EditHeaderProps) => {
  const theme = useTheme()
  const bulletChar = '• '
  const statusColor =
    status === 'failed'
      ? theme.error
      : status === 'applied'
        ? theme.success
        : status === 'queued'
          ? theme.muted
          : theme.warning
  const statsText =
    stats.added > 0 || stats.removed > 0
      ? ` +${stats.added}/-${stats.removed}`
      : ''

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.foreground}>{bulletChar}</span>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {name}
        </span>
        {filePath ? <span fg={theme.foreground}>{` ${filePath}`}</span> : null}
        <span fg={statusColor}>{` ${statusLabel[status]}${statsText}`}</span>
      </text>
    </box>
  )
}

interface EditBodyProps {
  name: string
  filePath: string | null
  diffText: string
  isCreate: boolean
  status: EditStatus
  message: string | null
  stats: DiffStats
  availableWidth: number
}

const EditBody = ({
  name,
  filePath,
  diffText,
  isCreate,
  status,
  message,
  stats,
  availableWidth,
}: EditBodyProps) => {
  const theme = useTheme()
  const messageColor = status === 'failed' ? theme.error : theme.muted

  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      <EditHeader
        name={name}
        filePath={filePath}
        status={status}
        stats={stats}
      />
      {message ? (
        <box style={{ paddingLeft: 2, width: '100%' }}>
          <text style={{ wrapMode: 'word' }}>
            <span fg={messageColor}>{message}</span>
          </text>
        </box>
      ) : null}
      {diffText.length > 0 && (
        <box style={{ paddingLeft: 2, width: '100%' }}>
          <DiffViewer diffText={diffText} availableWidth={Math.max(10, availableWidth - 4)} />
        </box>
      )}
    </box>
  )
}

function unwrapOutputValue(outputRaw: unknown): Record<string, unknown> | null {
  const value =
    Array.isArray(outputRaw) && outputRaw[0]?.value
      ? outputRaw[0].value
      : outputRaw
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (
    record.value &&
    typeof record.value === 'object' &&
    !Array.isArray(record.value)
  ) {
    return record.value as Record<string, unknown>
  }
  return record
}

function getStringField(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const field = value?.[key]
  return typeof field === 'string' && field.trim() ? field : null
}

function firstLine(text: string | null): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed) return null
  return trimmed.split('\n')[0] ?? null
}

function getEditStatus(toolBlock: Parameters<typeof extractDiff>[0]): {
  status: EditStatus
  message: string | null
} {
  const outputValue = unwrapOutputValue(toolBlock.outputRaw)
  const errorMessage = firstLine(getStringField(outputValue, 'errorMessage'))
  if (errorMessage) return { status: 'failed', message: errorMessage }

  const output = typeof toolBlock.output === 'string' ? toolBlock.output : ''
  if (
    output.trim().startsWith('Error:') ||
    output.trim().startsWith('Failed ')
  ) {
    return { status: 'failed', message: firstLine(output) }
  }

  const message = firstLine(getStringField(outputValue, 'message'))
  const hasOutput =
    toolBlock.outputRaw !== undefined || output.trim().length > 0
  // A queued write is waiting on a prior same-path write that is still in
  // flight. It has no output yet, so check this before the generic pending
  // branch so the UI shows "queued" rather than "pending". Once a `tool_start`
  // event arrives the block's `queued` flag is flipped to false, falling
  // through to the pending branch below.
  if (!hasOutput && toolBlock.queued === true) {
    return { status: 'queued', message: null }
  }
  if (!hasOutput) return { status: 'pending', message: null }
  return { status: 'applied', message }
}

function countDiffStats(diffText: string | null): DiffStats {
  if (!diffText) return { added: 0, removed: 0 }

  return diffText.split('\n').reduce(
    (stats, line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) stats.added += 1
      if (line.startsWith('-') && !line.startsWith('---')) stats.removed += 1
      return stats
    },
    { added: 0, removed: 0 },
  )
}

export const StrReplaceComponent = defineToolComponent({
  toolName: 'str_replace',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const diff = extractDiff(toolBlock)
    const filePath = extractFilePath(toolBlock)
    const isCreate = isCreateFile(toolBlock)
    const showDiff = shouldShowEditDiff(toolBlock)
    const { status, message } = getEditStatus(toolBlock)
    const stats = countDiffStats(diff)

    return {
      content: (
        <EditBody
          name={isCreate ? 'Create' : 'Edit'}
          filePath={filePath}
          diffText={showDiff ? (diff ?? '') : ''}
          isCreate={isCreate}
          status={status}
          message={message}
          stats={stats}
          availableWidth={options.availableWidth}
        />
      ),
    }
  },
})
