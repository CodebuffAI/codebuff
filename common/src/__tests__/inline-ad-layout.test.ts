import { describe, expect, it } from 'bun:test'

import {
  MIN_INLINE_WIDTH_WITH_DESTINATION,
  extractDomain,
  getAdDisplayLabel,
  getInlineAdLayout,
  truncateToWidth,
} from '../ads/inline-ad-layout'

const AD = {
  title: 'Ship Postgres in one command',
  adText: 'Serverless Postgres with branching.',
  url: 'https://neon.tech/freebuff',
}

describe('getInlineAdLayout at the widths the builder previews', () => {
  it('drops the destination domain entirely below 48 columns', () => {
    // This is the single most surprising thing about a narrow terminal, and
    // the reason the campaign builder previews 20 columns at all: an
    // advertiser who never sees it assumes their domain always shows.
    const narrow = getInlineAdLayout(AD, 20)
    const wide = getInlineAdLayout(AD, 48)

    expect(narrow.label).toBe('')
    expect(wide.label).toBe('neon.tech')
    expect(MIN_INLINE_WIDTH_WITH_DESTINATION).toBe(48)
  })

  it('keeps the domain at exactly 48 and loses it at 47', () => {
    expect(getInlineAdLayout(AD, 48).label).toBe('neon.tech')
    expect(getInlineAdLayout(AD, 47).label).toBe('')
  })

  it('truncates the title harder as the terminal narrows', () => {
    const widths = [20, 48, 60] as const
    const titles = widths.map((width) => getInlineAdLayout(AD, width).title)

    // Monotonic: a wider terminal never shows less title.
    expect(titles[0]!.length).toBeLessThan(titles[1]!.length)
    expect(titles[1]!.length).toBeLessThanOrEqual(titles[2]!.length)
    expect(titles[0]).toContain('…')
    expect(titles[2]).toBe(AD.title)
  })

  it('never returns a string wider than the content area', () => {
    for (const width of [20, 48, 60]) {
      const layout = getInlineAdLayout(AD, width)
      const contentWidth = Math.max(0, width - 4)
      expect(layout.title.length).toBeLessThanOrEqual(contentWidth)
      expect(layout.description.length).toBeLessThanOrEqual(contentWidth)
    }
  })

  it('survives a zero or negative width without throwing', () => {
    const layout = getInlineAdLayout(AD, 0)
    expect(layout.title).toBe('')
    expect(layout.description).toBe('')
    expect(layout.label).toBe('')
  })
})

describe('truncation measures UTF-16 code units, not display columns', () => {
  // Pinned deliberately. `truncateToWidth` uses String.length, so wide
  // characters occupy one unit here and two columns in a terminal — text that
  // fits by this measure can still overflow on screen. The web preview
  // reproduces this exactly rather than silently disagreeing with the
  // renderer; fixing it means fixing both at once.
  it('counts a CJK character as one unit', () => {
    expect(truncateToWidth('日本語テキスト', 5)).toBe('日本語テ…')
  })

  it('counts an astral-plane emoji as two units', () => {
    // '🚀' is a surrogate pair, so a naive slice can cut it in half.
    const truncated = truncateToWidth('🚀🚀🚀', 4)
    expect(truncated.length).toBeLessThanOrEqual(4)
  })

  it('leaves text alone when it already fits', () => {
    expect(truncateToWidth('short', 20)).toBe('short')
  })
})

describe('display label', () => {
  it('prefers the destination domain, stripped of www', () => {
    expect(extractDomain('https://www.neon.tech/x')).toBe('neon.tech')
    expect(getAdDisplayLabel(AD)).toEqual({
      text: 'neon.tech',
      variant: 'domain',
    })
  })

  it('falls back to the title when the ad carries no URL', () => {
    // Carbon exposes no destination URL, which is why one of its ads renders a
    // headline where a Gravity ad renders a domain.
    expect(getAdDisplayLabel({ title: 'A headline', url: '' })).toEqual({
      text: 'A headline',
      variant: 'title',
    })
  })

  it('falls back to Sponsored when there is neither', () => {
    expect(getAdDisplayLabel({ title: '', url: '' })).toEqual({
      text: 'Sponsored',
      variant: 'title',
    })
  })

  it('returns unparseable input unchanged rather than throwing', () => {
    expect(extractDomain('not a url')).toBe('not a url')
  })
})
