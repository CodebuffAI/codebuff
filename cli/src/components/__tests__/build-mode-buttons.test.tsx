import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { computeTerminalLayout } from '../../hooks/use-terminal-layout'
import { chatThemes } from '../../utils/theme-system'
import type { TerminalLayout } from '../../hooks/use-terminal-layout'

// Allow per-test override of the mocked terminal layout.
let mockLayout: TerminalLayout

mock.module('../../hooks/use-terminal-layout', () => ({
  computeTerminalLayout,
  useTerminalLayout: () => mockLayout,
}))

const { BuildModeButtons } = await import('../build-mode-buttons')

initializeThemeStore()

const theme = chatThemes.dark

describe('BuildModeButtons', () => {
  test('renders the prompt text and Execute Plan button on normal width', () => {
    mockLayout = computeTerminalLayout(80, 24)
    const markup = renderToStaticMarkup(
      <BuildModeButtons theme={theme} onBuildFast={() => {}} />,
    )

    expect(markup).toContain('Choose an option to build this plan:')
    expect(markup).toContain('Execute Plan')
  })

  test('omits the prompt text on narrow (xs) width', () => {
    // Width < 50 maps to xs
    mockLayout = computeTerminalLayout(40, 24)
    const markup = renderToStaticMarkup(
      <BuildModeButtons theme={theme} onBuildFast={() => {}} />,
    )

    expect(markup).not.toContain('Choose an option to build this plan:')
    // The button itself should still render
    expect(markup).toContain('Execute Plan')
  })

  test('always renders the Execute Plan button regardless of width', () => {
    mockLayout = computeTerminalLayout(30, 10)
    const markup = renderToStaticMarkup(
      <BuildModeButtons theme={theme} onBuildFast={() => {}} />,
    )

    expect(markup).toContain('Execute Plan')
  })
})
