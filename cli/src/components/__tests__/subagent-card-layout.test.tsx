import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../hooks/use-theme'
import { AgentBranchItem } from '../blocks/agent-branch-item'
import { ToolCallItem } from '../tools/tool-call-item'

initializeThemeStore()

const hasWrappedLine = (markup: string, prefix: string): boolean =>
  markup.includes(`${prefix}\n`)

describe('subagent card width containment', () => {
  test('wraps collapsed agent preview to the card content width', () => {
    const markup = renderToStaticMarkup(
      <AgentBranchItem
        name="Editor"
        isCollapsed={true}
        isStreaming={false}
        preview="abcdefghijklmnopqrst"
        availableWidth={14}
      />,
    )

    expect(hasWrappedLine(markup, 'abcdefghij')).toBe(true)
  })

  test('wraps expanded agent text children to the card content width', () => {
    const markup = renderToStaticMarkup(
      <AgentBranchItem
        name="Editor"
        isCollapsed={false}
        isStreaming={false}
        preview=""
        availableWidth={14}
      >
        abcdefghijklmnopqrst
      </AgentBranchItem>,
    )

    expect(hasWrappedLine(markup, 'abcdefghij')).toBe(true)
  })

  test('contains keyed expanded child components inside the card width', () => {
    const markup = renderToStaticMarkup(
      <AgentBranchItem
        name="Editor"
        isCollapsed={false}
        isStreaming={false}
        preview=""
        availableWidth={14}
      >
        <box key="wide-tool-output" style={{ width: 100 }}>
          <text>abcdefghijklmnopqrstuvwxyz</text>
        </box>
      </AgentBranchItem>,
    )

    expect(markup).toContain(
      'flex-grow:1;flex-shrink:1;min-width:0;width:100%;overflow:hidden;gap:1',
    )
  })

  test('wraps collapsed tool preview inside its available width', () => {
    const markup = renderToStaticMarkup(
      <ToolCallItem
        name="run_terminal_command"
        content={null}
        isCollapsed={true}
        isStreaming={false}
        streamingPreview=""
        finishedPreview="abcdefghijklmnopqrst"
        availableWidth={14}
      />,
    )

    expect(hasWrappedLine(markup, 'abcdefghijkl')).toBe(true)
  })
})
