import { test, expect } from 'bun:test'
import React from 'react'

import { AgentBranchWrapper } from '../blocks/agent-branch-wrapper'
import { initializeThemeStore } from '../../hooks/use-theme'
import { chatThemes, createMarkdownPalette } from '../../utils/theme-system'

import type { AgentContentBlock } from '../../types/chat'

initializeThemeStore()

const palette = createMarkdownPalette(chatThemes.dark)

const makeAgentBlock = (lines: number): AgentContentBlock => ({
  type: 'agent',
  agentId: 'a1',
  agentName: 'Editor',
  agentType: 'editor',
  content: '',
  status: 'complete',
  isCollapsed: false,
  blocks: [
    {
      type: 'text',
      content: Array.from(
        { length: lines },
        (_, i) => `BODY-LINE-${i + 1}`,
      ).join('\n'),
      status: 'complete',
    },
  ],
})

/**
 * Regression test for the expanded-agent-card overflow bug.
 *
 * The agent card renderers were switched to flexGrow/flexShrink on their
 * (vertical) column axis, which let a bounded-height ancestor compress the
 * card below its content height. OpenTUI then paints the overflowing body
 * lines past the card border, overwriting the frame (border + neighboring
 * "orchestrator" text). See agent-branch-item / agent-branch-wrapper /
 * agent-block-grid.
 *
 * Here we render an expanded card taller than its viewport (vertical
 * pressure) using a plain fixed-height box (a bounded, non-scrolling
 * ancestor). With the cards pinned to content height, the card keeps its
 * full height and its bottom border stays intact; if the cards can shrink,
 * the body spills over the border and it is no longer a clean run of box
 * characters.
 */
const renderTest = process.env.NODE_ENV === 'production' ? test.skip : test

renderTest(
  'expanded agent card keeps an intact border under vertical pressure',
  async () => {
    const { testRender } = await import('@opentui/react/test-utils')
    const { renderOnce, captureCharFrame } = await testRender(
      <box
        style={{
          flexDirection: 'column',
          height: 10,
          justifyContent: 'flex-end',
        }}
      >
        <AgentBranchWrapper
          agentBlock={makeAgentBlock(8)}
          keyPrefix="k"
          availableWidth={30}
          markdownPalette={palette}
          onToggleCollapsed={() => {}}
          onBuildFast={() => {}}
          onInsertCommand={() => {}}
        />
      </box>,
      { width: 34, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()

    // A bottom border must be visible (card not shrunk out of the viewport)...
    const borderLines = frame.split('\n').filter((l) => l.includes('╰'))
    expect(borderLines.length).toBeGreaterThan(0)
    // ...and it must be a clean run of box-drawing chars — no body text spilled
    // onto it.
    for (const line of borderLines) {
      expect(line).not.toMatch(/[A-Za-z]/)
    }
  },
)
