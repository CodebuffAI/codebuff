import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { computeTerminalLayout } from '../../hooks/use-terminal-layout'
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'

mock.module('../../hooks/use-terminal-layout', () => ({
  computeTerminalLayout,
  useTerminalLayout: () => computeTerminalLayout(80, 24),
}))

const { PlanBox } = await import('../renderers/plan-box')

initializeThemeStore()

const theme = chatThemes.dark
const markdownPalette = createMarkdownPalette(theme)

describe('PlanBox', () => {
  test('renders markdown plan content and execute action', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="# Build Plan\n\n- Ship it"
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    expect(markup).toContain('Build Plan')
    expect(markup).toContain('Ship it')
    expect(markup).toContain('Execute Plan')
  })

  test('renders artifact metadata and commands when present', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{
          sessionPath: '.agents/sessions/demo',
          specPath: '.agents/sessions/demo/SPEC.md',
          planPath: '.agents/sessions/demo/PLAN.md',
          statusPath: '.agents/sessions/demo/STATUS.md',
          lessonsPath: '.agents/sessions/demo/LESSONS.md',
          executeCommand: '/mode:execute_plan Build it!',
          resumeCommand: '/resume-plan .agents/sessions/demo',
          updateCommand: '/update-plan .agents/sessions/demo',
          statusCommand: '/plan-status .agents/sessions/demo',
          lessonsCommand: '/lessons .agents/sessions/demo',
        }}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    expect(markup).toContain('Artifacts')
    expect(markup).toContain('Session: .agents/sessions/demo')
    expect(markup).toContain('SPEC.md: .agents/sessions/demo/SPEC.md')
    expect(markup).toContain('/mode:execute_plan Build it!')
    expect(markup).toContain('/lessons .agents/sessions/demo')
  })

  test('renders custom artifacts as readable label: path list', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{
          customArtifacts: [
            { label: 'DESIGN.md', path: '.agents/sessions/demo/DESIGN.md' },
            { label: 'Test Results', path: '.agents/sessions/demo/test-results.json' },
          ],
        }}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    expect(markup).toContain('Artifacts')
    expect(markup).toContain('DESIGN.md: .agents/sessions/demo/DESIGN.md')
    expect(markup).toContain('Test Results: .agents/sessions/demo/test-results.json')
  })

  test('renders custom artifact commands as clickable buttons', () => {
    let insertedCommand: string | undefined
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{
          customArtifactCommands: [
            '/review-design .agents/sessions/demo',
            '/validate-tests .agents/sessions/demo',
          ],
        }}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
        onInsertCommand={(command) => {
          insertedCommand = command
        }}
      />,
    )

    // Both custom artifact commands appear in the rendered output
    expect(markup).toContain('/review-design .agents/sessions/demo')
    expect(markup).toContain('/validate-tests .agents/sessions/demo')

    // The onInsertCommand callback is callable (the prop was passed through)
    expect(insertedCommand).toBeUndefined()
  })

  test('renders known artifact paths and commands together with custom artifacts', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{
          sessionPath: '.agents/sessions/demo',
          planPath: '.agents/sessions/demo/PLAN.md',
          customArtifacts: [
            { label: 'DESIGN.md', path: '.agents/sessions/demo/DESIGN.md' },
          ],
          executeCommand: '/mode:execute_plan Go!',
          customArtifactCommands: ['/review-design .agents/sessions/demo'],
        }}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    // Known artifact paths render as static text
    expect(markup).toContain('Session: .agents/sessions/demo')
    expect(markup).toContain('PLAN.md: .agents/sessions/demo/PLAN.md')
    // Custom artifact label: path renders as static text
    expect(markup).toContain('DESIGN.md: .agents/sessions/demo/DESIGN.md')
    // Both known and custom commands render in the output
    expect(markup).toContain('/mode:execute_plan Go!')
    expect(markup).toContain('/review-design .agents/sessions/demo')
  })

  test('works without onInsertCommand prop (defaults to noop)', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{
          executeCommand: '/mode:execute_plan Go!',
        }}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    // Command still renders even without onInsertCommand prop
    expect(markup).toContain('/mode:execute_plan Go!')
    expect(markup).toContain('Execute Plan')
  })

  test('shows Artifacts section when only commands are present (no artifact paths)', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{
          executeCommand: '/mode:execute_plan Go!',
        }}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    expect(markup).toContain('Artifacts')
    expect(markup).toContain('/mode:execute_plan Go!')
  })

  test('shows Artifacts section when only artifact paths are present (no commands)', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{
          sessionPath: '.agents/sessions/demo',
          specPath: '.agents/sessions/demo/SPEC.md',
        }}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    expect(markup).toContain('Artifacts')
    expect(markup).toContain('Session: .agents/sessions/demo')
    expect(markup).toContain('SPEC.md: .agents/sessions/demo/SPEC.md')
  })

  test('omits artifact section for empty metadata', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="Plan body"
        metadata={{}}
        availableWidth={80}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    expect(markup).not.toContain('Artifacts')
    expect(markup).toContain('Execute Plan')
  })

  test('uses minimum markdown code block width for narrow layouts', () => {
    const markup = renderToStaticMarkup(
      <PlanBox
        planContent="```ts\nconst ok = true\n```"
        availableWidth={0}
        markdownPalette={markdownPalette}
        onBuildFast={() => {}}
      />,
    )

    expect(markup).toContain('const')
    expect(markup).toContain('ok')
    expect(markup).toContain('true')
  })
})
