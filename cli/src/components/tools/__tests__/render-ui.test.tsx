import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import { chatThemes } from '../../../utils/theme-system'
import { RenderUIComponent } from '../render-ui'

import type { ToolBlock } from '../types'

initializeThemeStore()

const createToolBlock = (
  input: unknown,
): ToolBlock & { toolName: 'render_ui' } => ({
  type: 'tool',
  toolName: 'render_ui',
  toolCallId: 'test-render-ui-call-id',
  input,
})

describe('RenderUIComponent', () => {
  test('renders a button widget', () => {
    const result = RenderUIComponent.render(
      createToolBlock({
        widget: {
          type: 'button',
          text: 'Open preview',
          link: 'https://example.com/preview',
          variant: 'primary',
        },
      }),
      chatThemes.light,
      {
        availableWidth: 80,
        indentationOffset: 0,
        labelWidth: 10,
      },
    )

    expect(result.collapsedPreview).toBe(
      'Open preview -> https://example.com/preview',
    )
    expect(result.content).toBeDefined()
    expect(renderToStaticMarkup(<>{result.content}</>)).toContain(
      'Open preview',
    )
  })

  test('returns no content for unsupported widgets', () => {
    const result = RenderUIComponent.render(
      createToolBlock({
        widget: {
          type: 'slider',
          text: 'Volume',
        },
      }),
      chatThemes.light,
      {
        availableWidth: 80,
        indentationOffset: 0,
        labelWidth: 10,
      },
    )

    expect(result.content).toBeNull()
  })
})
