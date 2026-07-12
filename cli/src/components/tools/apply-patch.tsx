import { TextAttributes } from '@opentui/core'

import { DiffViewer } from './diff-viewer'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import {
  getCanonicalMutationResult,
  getStructuredErrorMessages,
} from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig } from './types'

type PatchOperation =
  | { type: 'create_file'; path: string; diff: string }
  | { type: 'update_file'; path: string; diff: string }
  | { type: 'delete_file'; path: string }

function parseOperation(input: unknown): PatchOperation | null {
  if (!input || typeof input !== 'object') return null
  const op = (input as { operation?: unknown }).operation
  if (!op || typeof op !== 'object') return null
  const { type, path, diff } = op as Record<string, unknown>
  if (typeof type !== 'string' || typeof path !== 'string') return null
  if (type === 'create_file' && typeof diff === 'string') {
    return { type: 'create_file', path, diff }
  }
  if (type === 'update_file' && typeof diff === 'string') {
    return { type: 'update_file', path, diff }
  }
  if (type === 'delete_file') {
    return { type: 'delete_file', path }
  }
  return null
}

interface EditHeaderProps {
  name: string
  filePath: string
  status: PatchStatus
  message: string | null
}

type PatchStatus =
  | 'queued'
  | 'pending'
  | 'applied'
  | 'failed'
  | 'cancelled'
  | 'rolled back'
  | 'rollback incomplete'
  | 'unconfirmed'

const EditHeader = ({ name, filePath, status, message }: EditHeaderProps) => {
  const theme = useTheme()
  const bulletChar = '• '
  const statusColor =
    status === 'failed'
      ? theme.error
      : status === 'applied'
        ? theme.success
        : theme.warning

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <box
        style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}
      >
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.foreground}>{bulletChar}</span>
          <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
            {name}
          </span>
          <span fg={theme.foreground}>{` ${filePath}`}</span>
          <span fg={statusColor}>{` ${status}`}</span>
        </text>
      </box>
      {message ? (
        <box style={{ paddingLeft: 2, width: '100%' }}>
          <text fg={status === 'failed' ? theme.error : theme.muted}>
            {message}
          </text>
        </box>
      ) : null}
    </box>
  )
}

interface PatchOperationItemProps {
  operation: PatchOperation
  availableWidth: number
  status: PatchStatus
  message: string | null
}

const PatchOperationItem = ({
  operation,
  availableWidth,
  status,
  message,
}: PatchOperationItemProps) => {
  const theme = useTheme()
  if (operation.type === 'delete_file') {
    return (
      <EditHeader
        name="Delete"
        filePath={operation.path}
        status={status}
        message={message}
      />
    )
  }

  const name = operation.type === 'create_file' ? 'Create' : 'Edit'
  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <EditHeader
        name={name}
        filePath={operation.path}
        status={status}
        message={message}
      />
      {[
        'applied',
        'failed',
        'unconfirmed',
        'rolled back',
        'rollback incomplete',
      ].includes(status) ? (
        <box style={{ paddingLeft: 2, width: '100%' }}>
          {status !== 'applied' ? (
            <text fg={theme.warning}>Attempted patch (not applied)</text>
          ) : null}
          <DiffViewer
            diffText={operation.diff}
            availableWidth={Math.max(10, availableWidth - 4)}
          />
        </box>
      ) : null}
    </box>
  )
}

function unwrapOutputValue(outputRaw: unknown): Record<string, unknown> | null {
  const value =
    Array.isArray(outputRaw) && outputRaw[0]?.value
      ? outputRaw[0].value
      : outputRaw
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function getFailureMessage(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return /^(?:error|failed|failure|blocked)\b/i.test(trimmed) ||
      /\b(?:not applied|no changes were (?:made|written))\b/i.test(trimmed)
      ? trimmed
      : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const failure = getFailureMessage(item, depth + 1)
      if (failure) return failure
    }
    return null
  }
  if (typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const directError =
    typeof record.errorMessage === 'string'
      ? record.errorMessage.trim()
      : typeof record.error === 'string'
        ? record.error.trim()
        : null
  if (directError) return directError
  if (
    record.success === false ||
    record.applied === false ||
    record.status === 'failed' ||
    record.status === 'error'
  ) {
    return firstLine(record.message) ?? 'Patch was not applied.'
  }
  for (const nested of Object.values(record)) {
    const failure = getFailureMessage(nested, depth + 1)
    if (failure) return failure
  }
  return null
}

function hasPositiveSuccessEvidence(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.success === true ||
    record.applied === true ||
    (Array.isArray(record.applied) && record.applied.length > 0) ||
    record.status === 'applied' ||
    record.status === 'success'
  )
}

function firstLine(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return value.trim().split('\n')[0] ?? null
}

function getPatchStatus(toolBlock: {
  outputRaw?: unknown
  output?: unknown
  queued?: boolean
  lifecycle?: string
}): { status: PatchStatus; message: string | null } {
  if (toolBlock.lifecycle === 'cancelled') {
    return { status: 'cancelled', message: 'Cancelled before completion.' }
  }
  const structuredErrors = getStructuredErrorMessages(toolBlock.outputRaw)
  if (structuredErrors.length > 0) {
    return { status: 'failed', message: structuredErrors.join('\n') }
  }
  const canonical = getCanonicalMutationResult(toolBlock.outputRaw)
  if (canonical) {
    const labels: Record<string, PatchStatus> = {
      applied: 'applied',
      not_applied: 'failed',
      partial: 'rollback incomplete',
      rolled_back: 'rolled back',
      rollback_incomplete: 'rollback incomplete',
      unconfirmed: 'unconfirmed',
    }
    const rows = Array.isArray(canonical.actions)
      ? canonical.actions.map((raw) => {
          const action = raw as Record<string, unknown>
          const rollback = action.rollback as
            | Record<string, unknown>
            | undefined
          return `${String(action.path)} • ${String(action.action)} • ${String(action.outcome)}${rollback?.attempted ? ` • rollback ${rollback.succeeded ? 'succeeded' : 'failed'}` : ''}`
        })
      : []
    return {
      status: labels[String(canonical.outcome)] ?? 'failed',
      message: rows.length > 0 ? rows.join('\n') : null,
    }
  }
  const value = unwrapOutputValue(toolBlock.outputRaw)
  const error = getFailureMessage(
    toolBlock.outputRaw === undefined ? toolBlock.output : toolBlock.outputRaw,
  )
  if (error) return { status: 'failed', message: error }

  const hasOutput =
    toolBlock.outputRaw !== undefined ||
    (typeof toolBlock.output === 'string' && toolBlock.output.trim().length > 0)
  if (!hasOutput) {
    return {
      status: toolBlock.queued === true ? 'queued' : 'pending',
      message: null,
    }
  }
  if (hasPositiveSuccessEvidence(value)) {
    return { status: 'applied', message: firstLine(value?.message) }
  }
  return {
    status: 'failed',
    message: 'Unrecognized apply_patch result; success was not confirmed.',
  }
}

export const ApplyPatchComponent = defineToolComponent({
  toolName: 'apply_patch',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const operation = parseOperation(toolBlock.input)

    if (!operation) {
      return { content: null }
    }
    const { status, message } = getPatchStatus(toolBlock)

    return {
      content: (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <PatchOperationItem
            operation={operation}
            availableWidth={options.availableWidth}
            status={status}
            message={message}
          />
        </box>
      ),
    }
  },
})
