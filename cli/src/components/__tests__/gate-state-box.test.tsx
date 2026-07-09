import { describe, test, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { chatThemes } from '../../utils/theme-system'
import { GateStateBox } from '../renderers/gate-state-box'

import type { GateStateContentBlock } from '../../types/chat'

initializeThemeStore()

const theme = chatThemes.dark

const makeBlock = (
  overrides: Partial<GateStateContentBlock> = {},
): GateStateContentBlock => ({
  type: 'gate-state',
  gate: 'validation/reviewer',
  gateStatus: 'passed',
  ...overrides,
})

describe('GateStateBox', () => {
  test('renders passed status with checkmark icon and PASSED label', () => {
    const markup = renderToStaticMarkup(
      <GateStateBox block={makeBlock({ gateStatus: 'passed' })} />,
    )

    expect(markup).toContain('✓')
    expect(markup).toContain('PASSED')
    expect(markup).toContain('validation/reviewer')
  })

  test('renders failed status with cross icon', () => {
    const markup = renderToStaticMarkup(
      <GateStateBox block={makeBlock({ gateStatus: 'failed' })} />,
    )

    expect(markup).toContain('✗')
    expect(markup).toContain('FAILED')
  })

  test('renders pending status with ellipsis icon', () => {
    const markup = renderToStaticMarkup(
      <GateStateBox block={makeBlock({ gateStatus: 'pending' })} />,
    )

    expect(markup).toContain('…')
    expect(markup).toContain('PENDING')
  })

  test('renders skipped status with dash icon', () => {
    const markup = renderToStaticMarkup(
      <GateStateBox block={makeBlock({ gateStatus: 'skipped' })} />,
    )

    expect(markup).toContain('–')
    expect(markup).toContain('SKIPPED')
  })

  test('renders origin label when provided', () => {
    const markup = renderToStaticMarkup(
      <GateStateBox
        block={makeBlock({ gateStatus: 'passed', origin: 'Promotion' })}
      />,
    )

    expect(markup).toContain('Promotion')
  })

  test('defaults origin to "Gate" when not provided', () => {
    const block = makeBlock({ gateStatus: 'passed' })
    delete (block as Partial<GateStateContentBlock>).origin
    const markup = renderToStaticMarkup(<GateStateBox block={block} />)

    expect(markup).toContain('Gate')
  })

  test('renders details when provided', () => {
    const markup = renderToStaticMarkup(
      <GateStateBox
        block={makeBlock({
          gateStatus: 'failed',
          details: 'hooks failed: typecheck exit 1',
        })}
      />,
    )

    expect(markup).toContain('hooks failed: typecheck exit 1')
  })

  test('omits details section when not provided', () => {
    const block = makeBlock({ gateStatus: 'passed' })
    delete block.details
    const markup = renderToStaticMarkup(<GateStateBox block={block} />)

    expect(markup).toContain('validation/reviewer')
    expect(markup).not.toContain('undefined')
  })

  test('uses error color for failed status', () => {
    const failedMarkup = renderToStaticMarkup(
      <GateStateBox block={makeBlock({ gateStatus: 'failed' })} />,
    )

    // The theme error color should appear as a foreground attribute
    expect(failedMarkup).toContain(theme.error)
  })

  test('uses success color for passed status', () => {
    const passedMarkup = renderToStaticMarkup(
      <GateStateBox block={makeBlock({ gateStatus: 'passed' })} />,
    )

    expect(passedMarkup).toContain(theme.success)
  })
})
