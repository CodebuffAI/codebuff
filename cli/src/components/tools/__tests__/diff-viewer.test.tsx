import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { initializeThemeStore } from '../../../hooks/use-theme'
import {
  DiffViewer,
  DIFF_INITIAL_MAX_HUNKS,
  DIFF_INITIAL_MAX_LINES,
  formatLineNumber,
  getInitiallyCollapsedDiffHunks,
  parseDiffIntoHunks,
} from '../diff-viewer'

initializeThemeStore()

const render = (props: React.ComponentProps<typeof DiffViewer>): string =>
  renderToStaticMarkup(<DiffViewer {...props} />)

describe('DiffViewer', () => {
  test('[PERF-M02] initial render plan caps hunks and lines', () => {
    const diff = Array.from(
      { length: DIFF_INITIAL_MAX_HUNKS + 2 },
      (_, index) =>
        `@@ -${index + 1},10 +${index + 1},10 @@\n${Array.from({ length: 10 }, () => ' context').join('\n')}`,
    ).join('\n')
    const parsed = parseDiffIntoHunks(diff)
    const collapsed = getInitiallyCollapsedDiffHunks(parsed)
    const visible = parsed.hunks.filter(
      (hunk) => !collapsed.includes(hunk.index),
    )
    expect(visible.length).toBeLessThanOrEqual(DIFF_INITIAL_MAX_HUNKS)
    expect(
      visible.reduce((sum, hunk) => sum + hunk.bodyLines.length, 0),
    ).toBeLessThanOrEqual(DIFF_INITIAL_MAX_LINES)
  })

  test('[PERF-M02] hides line-number gutters at narrow widths', () => {
    const markup = render({
      diffText: '@@ -1 +1 @@\n-old\n+new',
      availableWidth: 20,
    })
    expect(markup).not.toContain('│')
  })

  describe('parseDiffIntoHunks', () => {
    test('parses a standard hunk header and tracks old/new line numbers', () => {
      const { fileHeaders, hunks } = parseDiffIntoHunks(
        '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
      )

      expect(fileHeaders).toEqual([])
      expect(hunks).toHaveLength(1)

      const hunk = hunks[0]
      expect(hunk.header).toBe('@@ -1,2 +1,2 @@')
      expect(hunk.oldStart).toBe(1)
      expect(hunk.newStart).toBe(1)
      expect(hunk.oldLen).toBe(2)
      expect(hunk.newLen).toBe(2)

      // context: old=1 new=1 ; del: old=2 new=null ; add: old=null new=2
      expect(hunk.bodyLines).toEqual([
        { type: 'context', text: 'context', oldNum: 1, newNum: 1 },
        { type: 'del', text: 'old', oldNum: 2, newNum: null },
        { type: 'add', text: 'new', oldNum: null, newNum: 2 },
      ])
    })

    test('tolerates a degenerate `@@` hunk header with no ranges', () => {
      const { hunks } = parseDiffIntoHunks('@@\n-oldLine\n+newLine\n')
      expect(hunks).toHaveLength(1)
      expect(hunks[0].oldStart).toBe(1)
      expect(hunks[0].newStart).toBe(1)
      expect(hunks[0].oldLen).toBe(0)
      expect(hunks[0].newLen).toBe(0)
      expect(hunks[0].bodyLines).toEqual([
        { type: 'del', text: 'oldLine', oldNum: 1, newNum: null },
        { type: 'add', text: 'newLine', oldNum: null, newNum: 1 },
      ])
    })

    test('splits leading file headers from hunks', () => {
      const { fileHeaders, hunks } = parseDiffIntoHunks(
        'diff --git a/x b/x\nindex abc..def 100644\n--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n keep\n',
      )
      expect(fileHeaders).toEqual([
        'diff --git a/x b/x',
        'index abc..def 100644',
        '--- a/x',
        '+++ b/x',
      ])
      expect(hunks).toHaveLength(1)
    })

    test('skips no-newline markers as body rows', () => {
      const { hunks } = parseDiffIntoHunks(
        '@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n',
      )
      expect(hunks[0].bodyLines).toHaveLength(2)
      expect(hunks[0].bodyLines[0].type).toBe('del')
      expect(hunks[0].bodyLines[1].type).toBe('add')
    })
  })

  describe('formatLineNumber', () => {
    test('right-aligns numbers and blanks nulls', () => {
      expect(formatLineNumber(1)).toBe('   1')
      expect(formatLineNumber(12345)).toBe('12345')
      expect(formatLineNumber(null)).toBe('    ')
      expect(formatLineNumber(7, 6)).toBe('     7')
    })
  })

  test('renders the hunk header (not stripped)', () => {
    const markup = render({
      diffText: '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
      availableWidth: 80,
    })
    expect(markup).toContain('@@ -1,2 +1,2 @@')
  })

  test('renders line numbers with blank old-num on adds and blank new-num on dels', () => {
    const { hunks } = parseDiffIntoHunks(
      '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
    )
    const [ctx, del, add] = hunks[0].bodyLines
    expect(ctx.oldNum).toBe(1)
    expect(ctx.newNum).toBe(1)
    expect(del.oldNum).toBe(2)
    expect(del.newNum).toBe(null)
    expect(add.oldNum).toBe(null)
    expect(add.newNum).toBe(2)

    // The line-number gutter is present in rendered output. The gutter and
    // body render as separate <span> elements, so check them independently.
    const markup = render({
      diffText: '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
      availableWidth: 80,
    })
    expect(markup).toContain('│')
    expect(markup).toContain('>-old<')
    expect(markup).toContain('>+new<')
  })

  test('per-hunk collapse hides the body and shows the collapsed marker', () => {
    const diff = '@@ -1,2 +1,2 @@\n context\n-old\n+new\n'

    const expanded = render({ diffText: diff, availableWidth: 80 })
    expect(expanded).toContain('▾')
    expect(expanded).toContain('@@ -1,2 +1,2 @@')
    expect(expanded).toContain('-old')
    expect(expanded).toContain('+new')

    const collapsed = render({
      diffText: diff,
      availableWidth: 80,
      initiallyCollapsedHunks: [0],
    })
    expect(collapsed).toContain('▸')
    expect(collapsed).toContain('lines hidden')
    expect(collapsed).not.toContain('-old')
    expect(collapsed).not.toContain('+new')
  })

  test('collapsible=false omits the toggle marker but keeps the header', () => {
    const markup = render({
      diffText: '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
      availableWidth: 80,
      collapsible: false,
    })
    expect(markup).toContain('@@ -1,2 +1,2 @@')
    expect(markup).not.toContain('▾')
    expect(markup).not.toContain('▸')
    expect(markup).toContain('-old')
  })

  test('side-by-side mode renders two columns separated by │ on wide terminals', () => {
    const markup = render({
      diffText: '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
      availableWidth: 80,
      sideBySide: true,
    })
    expect(markup).toContain(' │ ')
  })

  test('side-by-side degrades to unified when width < 40', () => {
    const markup = render({
      diffText: '@@ -1,2 +1,2 @@\n context\n-old\n+new\n',
      availableWidth: 30,
      sideBySide: true,
    })
    expect(markup).not.toContain(' │ ')
    // Unified gutter + body still present (rendered as separate spans).
    expect(markup).toContain('│')
    expect(markup).toContain('>-old<')
    expect(markup).toContain('>+new<')
  })

  test('backward compat: only diffText + availableWidth keeps -old/+new substrings', () => {
    const markup = render({
      diffText: '@@\n-oldLine\n+newLine\n',
      availableWidth: 80,
    })
    expect(markup).toContain('-oldLine')
    expect(markup).toContain('+newLine')
  })

  test('empty diff renders a muted no-changes placeholder', () => {
    const markup = render({ diffText: '   \n  ', availableWidth: 80 })
    expect(markup).toContain('(no changes)')
  })
})
