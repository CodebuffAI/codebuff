import React from 'react'

import { useTheme } from '../../hooks/use-theme'
import { wrapTextPreservingNewlines } from '../../utils/text-layout'

const MAX_VISIBLE_ITEMS = 50

export function DiscoveryOutput({
  status,
  message,
  error,
  provenance,
  items,
  availableWidth,
  maxVisibleItems = MAX_VISIBLE_ITEMS,
}: {
  status: string
  message?: string
  error?: string
  provenance?: string
  items?: string[]
  availableWidth: number
  maxVisibleItems?: number
}) {
  const theme = useTheme()
  const width = Math.max(10, availableWidth - 4)
  const visibleItems = (items ?? []).slice(0, maxVisibleItems)
  const hiddenCount = Math.max(0, (items?.length ?? 0) - visibleItems.length)

  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.muted}>Status: </span>
        <span fg={error ? theme.error : theme.foreground}>{status}</span>
      </text>
      {provenance ? (
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>Scope: </span>
          <span fg={theme.foreground}>
            {wrapTextPreservingNewlines(provenance, width)}
          </span>
        </text>
      ) : null}
      {error ? (
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.error}>
            {wrapTextPreservingNewlines(error, width)}
          </span>
        </text>
      ) : message ? (
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>
            {wrapTextPreservingNewlines(message, width)}
          </span>
        </text>
      ) : null}
      {visibleItems.map((item, index) => (
        <text key={`${item}-${index}`} style={{ wrapMode: 'word' }}>
          <span fg={theme.muted}>{`${index + 1}. `}</span>
          <span fg={theme.foreground}>
            {wrapTextPreservingNewlines(item, Math.max(10, width - 3))}
          </span>
        </text>
      ))}
      {hiddenCount > 0 ? (
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.warning}>
            {`… ${hiddenCount} more result${hiddenCount === 1 ? '' : 's'} omitted from the terminal view`}
          </span>
        </text>
      ) : null}
    </box>
  )
}

export function discoveryStatus(input: {
  lifecycle?: string
  hasOutput: boolean
  error?: string
  count?: number
}): string {
  if (input.error) return 'failed'
  if (input.lifecycle === 'queued') return 'queued'
  if (input.lifecycle === 'running' || !input.hasOutput) return 'running'
  if (input.lifecycle === 'cancelled') return 'cancelled'
  if (input.count === 0) return 'complete · no matches'
  return 'complete'
}
