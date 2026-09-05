import { describe, expect, it } from 'bun:test'

import {
  DOCK_CHORD_HINT_MIN_WIDTH,
  DOCK_PANEL_MAX_WIDTH,
  MIN_INLINE_WIDTH_WITH_DESTINATION,
  getDockAdLayout,
  getDockPanelLayout,
  wrapToLines,
} from '../ads/inline-ad-layout'

import type { DockAdInput } from '../ads/inline-ad-layout'

/** The console previews exactly these widths, so the tests do too. */
const PREVIEW_WIDTHS = [20, 48, 80, 100] as const

const AD: DockAdInput = {
  title: 'One place for your AI app data',
  adText: 'App data and vector search, together.',
  cta: 'Explore Atlas',
  url: 'https://mongodb.com/atlas',
}

const RICH_AD: DockAdInput = {
  ...AD,
  // Deliberately long enough to wrap to the full four body lines at 58
  // columns, so the ladder's third rung is reachable in this fixture.
  expandedBody:
    'Store, index, and query app data and vector embeddings together, so your AI apps stay context-rich and fast. One connection string, one operational model, and the same query language you already use every single day of the week.',
  diagram: '[ App ] -> [ Data + Vectors ]',
  bullets: [
    'Unified data and vector search',
    'Built-in scalability and reliability',
    'Security and governance built in',
  ],
}

describe('wrapToLines', () => {
  it('wraps on word boundaries and never exceeds the width', () => {
    const lines = wrapToLines('the quick brown fox jumps over', 10, 4)
    expect(lines).toEqual(['the quick', 'brown fox', 'jumps over'])
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10)
  })

  it('hard-splits a word wider than the line rather than overflowing', () => {
    // An advertiser body containing a long URL must not push the panel border
    // off screen; a hard split is ugly, an overflow is broken.
    const lines = wrapToLines('https://example.com/a/very/long/path', 12, 4)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(12)
    expect(lines.length).toBeGreaterThan(1)
  })

  it('ellipsises the last line when the text exceeds maxLines', () => {
    const lines = wrapToLines('aa bb cc dd ee ff gg hh ii jj', 6, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]!.endsWith('…')).toBe(true)
    expect(lines[1]!.length).toBeLessThanOrEqual(6)
  })

  it('returns nothing for empty text or a zero budget', () => {
    expect(wrapToLines('   ', 20, 4)).toEqual([])
    expect(wrapToLines('hello', 0, 4)).toEqual([])
    expect(wrapToLines('hello', 20, 0)).toEqual([])
  })
})

describe('getDockAdLayout at the widths the console previews', () => {
  it('falls back to the five-row card below 48 columns', () => {
    // The fallback is what keeps the house-ad width budget (title at width 20)
    // measuring the same layout it always did.
    expect(getDockAdLayout(AD, 20)).toEqual({ mode: 'card' })
    expect(getDockAdLayout(AD, 47)).toEqual({ mode: 'card' })
    expect(getDockAdLayout(AD, 48).mode).toBe('dock')
    expect(MIN_INLINE_WIDTH_WITH_DESTINATION).toBe(48)
  })

  it('produces a dock whose blocks sum to the interior at every width', () => {
    for (const width of PREVIEW_WIDTHS) {
      const layout = getDockAdLayout(AD, width)
      if (width < MIN_INLINE_WIDTH_WITH_DESTINATION) {
        expect(layout.mode).toBe('card')
        continue
      }
      if (layout.mode !== 'dock') throw new Error('expected a dock layout')
      // border(2) + padding(2) + copy + gap(2) + cta box == width
      expect(layout.copyWidth + layout.ctaBoxWidth + 2 + 4).toBe(width)
      expect(layout.headline.length).toBeLessThanOrEqual(layout.copyWidth)
      expect(layout.description.length).toBeLessThanOrEqual(layout.copyWidth)
    }
  })

  it('never lets the CTA box take more than half the interior', () => {
    const shouty = { ...AD, cta: 'Start your free thirty day trial right now' }
    for (const width of [48, 80, 100] as const) {
      const layout = getDockAdLayout(shouty, width)
      if (layout.mode !== 'dock') throw new Error('expected a dock layout')
      expect(layout.ctaBoxWidth).toBeLessThanOrEqual(Math.floor((width - 4) / 2))
      expect(layout.copyWidth).toBeGreaterThan(0)
    }
  })

  it('gives the description two lines only when there is no headline', () => {
    const headlined = getDockAdLayout(AD, 80)
    const bare = getDockAdLayout({ ...AD, title: '' }, 80)
    if (headlined.mode !== 'dock' || bare.mode !== 'dock') {
      throw new Error('expected dock layouts')
    }
    expect(headlined.descriptionLines).toBe(1)
    expect(bare.descriptionLines).toBe(2)
  })

  it('prints the chord hint only when collapsed and on an 80-column terminal', () => {
    // The threshold is a DOCK width: the dock is the terminal minus its two
    // one-cell margins, so an 80-column terminal is a 78-column dock. Comparing
    // 80 against the dock width would push the rule to an 82-column terminal,
    // where the hint never appears on the standard one.
    const hint = '⌃O details'
    const at80Terminal = getDockAdLayout(AD, 78, {
      chordHint: hint,
      collapsed: true,
    })
    const at79Terminal = getDockAdLayout(AD, 77, {
      chordHint: hint,
      collapsed: true,
    })
    const expanded = getDockAdLayout(AD, 100, {
      chordHint: hint,
      collapsed: false,
    })
    if (
      at80Terminal.mode !== 'dock' ||
      at79Terminal.mode !== 'dock' ||
      expanded.mode !== 'dock'
    ) {
      throw new Error('expected dock layouts')
    }
    expect(at80Terminal.chordHint).toBe(hint)
    expect(at79Terminal.chordHint).toBe('')
    expect(expanded.chordHint).toBe('')
    expect(DOCK_CHORD_HINT_MIN_WIDTH).toBe(78)
  })

  it('shortens the brand rather than the hint when both compete for the row', () => {
    const long = { ...AD, url: 'https://a-very-long-advertiser-domain.example' }
    const withHint = getDockAdLayout(long, 78, {
      chordHint: '⌃O details',
      collapsed: true,
    })
    const without = getDockAdLayout(long, 78, { collapsed: true })
    if (withHint.mode !== 'dock' || without.mode !== 'dock') {
      throw new Error('expected dock layouts')
    }
    expect(withHint.brand.length).toBeLessThan(without.brand.length)
  })

  it('survives a provider payload with missing fields', () => {
    // Providers cast their JSON rather than parsing it, so this is a real case
    // and a throw here is a throw inside the dock's render.
    const layout = getDockAdLayout(
      { title: undefined, adText: undefined, url: undefined } as never,
      80,
    )
    if (layout.mode !== 'dock') throw new Error('expected a dock layout')
    expect(layout.ctaText).toBe('Learn more')
    expect(layout.headline).toBe('')
  })
})

describe('getDockPanelLayout height-degradation ladder', () => {
  const ROOMY = 40

  it('keeps every block when there is room', () => {
    const panel = getDockPanelLayout(RICH_AD, {
      width: 58,
      availableRows: ROOMY,
    })
    expect(panel.fits).toBe(true)
    expect(panel.dropped).toEqual([])
    expect(panel.bullets).toHaveLength(3)
    expect(panel.diagram).not.toBe('')
    expect(panel.bodyLines.length).toBeGreaterThan(0)
  })

  it('drops the diagram first, then the bullets, then body lines 3-4', () => {
    const full = getDockPanelLayout(RICH_AD, {
      width: 58,
      availableRows: ROOMY,
    })
    const steps = [
      full.height - 1,
      full.height - 3,
      full.height - 8,
    ] as const
    const dropped = steps.map(
      (rows) =>
        getDockPanelLayout(RICH_AD, { width: 58, availableRows: rows }).dropped,
    )
    expect(dropped[0]).toEqual(['diagram'])
    expect(dropped[1]).toEqual(['diagram', 'bullets'])
    expect(dropped[2]).toEqual(['diagram', 'bullets', 'body'])
  })

  it('never reports fits when the smallest panel still would not fit', () => {
    // A 24-row terminal with a five-row dock and a composer leaves very little;
    // the caller must be told no rather than handed a panel over the input box.
    const panel = getDockPanelLayout(RICH_AD, { width: 58, availableRows: 8 })
    expect(panel.fits).toBe(false)
    expect(panel.height).toBeGreaterThan(8)
  })

  it('reports a height equal to the rows it actually asks for', () => {
    for (const rows of [12, 14, 16, 20, 30] as const) {
      const panel = getDockPanelLayout(RICH_AD, {
        width: 58,
        availableRows: rows,
      })
      if (!panel.fits) continue
      expect(panel.height).toBeLessThanOrEqual(rows)
      const interior =
        3 +
        panel.bodyLines.length +
        (panel.diagram ? 2 : 0) +
        (panel.bullets.length > 0 ? 1 + panel.bullets.length : 0) +
        5
      expect(panel.height).toBe(interior + 2)
    }
  })

  it('caps the panel at 58 columns however wide the terminal is', () => {
    expect(
      getDockPanelLayout(RICH_AD, { width: 200, availableRows: ROOMY }).width,
    ).toBe(DOCK_PANEL_MAX_WIDTH)
    expect(
      getDockPanelLayout(RICH_AD, { width: 40, availableRows: ROOMY }).width,
    ).toBe(40)
  })

  it('falls back to adText when the creative carries no expanded body', () => {
    const plain = getDockPanelLayout(AD, { width: 58, availableRows: ROOMY })
    expect(plain.bodyLines.join(' ')).toContain('vector search')
    expect(plain.bullets).toEqual([])
    expect(plain.diagram).toBe('')
  })

  it('clamps advertiser fields to their declared maximums', () => {
    const overlong = getDockPanelLayout(
      {
        ...RICH_AD,
        bullets: ['x'.repeat(80), 'y'.repeat(80), 'z'.repeat(80), 'w'],
        diagram: 'd'.repeat(80),
      },
      { width: 58, availableRows: ROOMY },
    )
    expect(overlong.bullets).toHaveLength(3)
    for (const bullet of overlong.bullets) {
      expect(bullet.length).toBeLessThanOrEqual(40)
    }
    expect(overlong.diagram.length).toBeLessThanOrEqual(40)
  })
})
