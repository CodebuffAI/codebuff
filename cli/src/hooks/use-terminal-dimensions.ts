import { useRenderer, useTerminalDimensions as useOpenTuiDimensions } from '@opentui/react'
import { useMemo } from 'react'

export const useTerminalDimensions = () => {
  const renderer = useRenderer()
  const { width: measuredWidth } = useOpenTuiDimensions()

  const sanitizeDimension = (
    value: number | null | undefined,
  ): number | null => {
    if (typeof value !== 'number') return null
    if (!Number.isFinite(value) || value <= 0) return null
    return value
  }

  const resolvedTerminalWidth = useMemo(
    () =>
      sanitizeDimension(measuredWidth) ?? sanitizeDimension(renderer?.width) ?? 80,
    [measuredWidth, renderer?.width],
  )

  const resolvedTerminalHeight = useMemo(
    () => sanitizeDimension(renderer?.height) ?? 24,
    [renderer?.height],
  )

  const terminalWidth = resolvedTerminalWidth
  const terminalHeight = resolvedTerminalHeight
  const separatorWidth = useMemo(
    () => Math.max(1, Math.floor(terminalWidth) - 2),
    [terminalWidth],
  )

  const contentMaxWidth = useMemo(
    () => Math.max(10, Math.min(terminalWidth - 4, 80)),
    [terminalWidth],
  )

  return {
    terminalWidth,
    terminalHeight,
    separatorWidth,
    contentMaxWidth,
  }
}
