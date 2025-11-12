import { describe, test, expect } from 'bun:test'
import stringWidth from 'string-width'

import {
  type Segment,
  processSegments,
  type ProcessedSegment,
} from '../../components/segmented-control'

import type { ChatTheme } from '../../types/theme-system'

const theme: ChatTheme = {
  name: 'dark',
  // Core
  primary: '#ff0',
  secondary: '#888',
  success: '#0f0',
  error: '#f00',
  warning: '#fa0',
  info: '#0af',
  // Neutral
  foreground: '#fff',
  background: 'transparent',
  muted: '#777',
  border: '#333',
  surface: '#000',
  surfaceHover: '#222',
  // Context
  aiLine: '#0a0',
  userLine: '#08f',
  agentToggleHeaderBg: '#f60',
  agentToggleExpandedBg: '#14e',
  agentFocusedBg: '#334155',
  agentContentBg: '#000000',
  // Input
  inputBg: '#000',
  inputFg: '#fff',
  inputFocusedBg: '#000',
  inputFocusedFg: '#fff',
  // Modes
  modeFastBg: '#f60',
  modeFastText: '#f60',
  modeMaxBg: '#d22',
  modeMaxText: '#d22',
  modePlanBg: '#14e',
  modePlanText: '#14e',
  // Markdown
  markdown: {
    codeBackground: '#111',
    codeHeaderFg: '#555',
    inlineCodeFg: '#fff',
    codeTextFg: '#fff',
    headingFg: {
      1: '#ff0',
      2: '#ff0',
      3: '#ff0',
      4: '#ff0',
      5: '#ff0',
      6: '#ff0',
    },
    listBulletFg: '#aaa',
    blockquoteBorderFg: '#444',
    blockquoteTextFg: '#eee',
    dividerFg: '#333',
    codeMonochrome: true,
  },
  messageTextAttributes: 0,
}

describe('SegmentedControl - processSegments', () => {
  test('computes width from label using string-width', () => {
    const segments: Segment[] = [
      { id: 'DEFAULT', label: 'DEFAULT' },
      { id: 'MAX', label: 'MAX' },
      { id: 'PLAN', label: 'PLAN' },
    ]

    const processed = processSegments(segments, null, false, theme)
    const widths = processed.map((s) => s.width)
    expect(widths).toEqual([
      stringWidth(' DEFAULT '),
      stringWidth(' MAX '),
      stringWidth(' PLAN '),
    ])
  })

  test('applies defaultHighlighted when nothing hovered', () => {
    const segments: Segment[] = [
      { id: 'DEFAULT', label: 'DEFAULT' },
      { id: 'MAX', label: 'MAX' },
      {
        id: 'active-DEFAULT',
        label: '> DEFAULT',
        isSelected: true,
        defaultHighlighted: true,
      },
    ]

    const processed = processSegments(segments, null, false, theme)
    const map: Record<string, ProcessedSegment> = Object.fromEntries(
      processed.map((p) => [p.id, p]),
    )

    expect(map['active-DEFAULT'].leftBorderColor).toBe(theme.foreground)
    expect(map['DEFAULT'].leftBorderColor).toBe(theme.border)
  })

  test('hovering a segment highlights it', () => {
    const segments: Segment[] = [
      { id: 'DEFAULT', label: 'DEFAULT' },
      { id: 'MAX', label: 'MAX' },
      { id: 'PLAN', label: 'PLAN' },
    ]
    const processed = processSegments(segments, 'MAX', true, theme)
    const map: Record<string, ProcessedSegment> = Object.fromEntries(
      processed.map((p) => [p.id, p]),
    )

    expect(map.MAX.isHovered).toBe(true)
    expect(map.MAX.leftBorderColor).toBe(theme.foreground)
    expect(map.DEFAULT.leftBorderColor).toBe(theme.border)
  })

  test('disabled segments use muted text and border colors', () => {
    const segments: Segment[] = [
      { id: 'DEFAULT', label: 'DEFAULT', disabled: true },
      { id: 'MAX', label: 'MAX' },
    ]
    const [fast, max] = processSegments(segments, null, false, theme)
    expect(fast.textColor).toBe(theme.muted)
    expect(fast.leftBorderColor).toBe(theme.border)
    expect(max.textColor).toBe(theme.foreground)
  })
})

describe('SegmentedControl - string width with double-width glyphs', () => {
  test('emoji and CJK characters increase width correctly', () => {
    const segments: Segment[] = [
      { id: 'E', label: '🚀MAX' },
      { id: 'CJK', label: '计划' },
    ]

    const processed = processSegments(segments, null, false, theme)

    expect(processed[0].width).toBe(stringWidth(' 🚀MAX '))
    expect(processed[1].width).toBe(stringWidth(' 计划 '))
  })
})
