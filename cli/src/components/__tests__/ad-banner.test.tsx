import { describe, expect, test } from 'bun:test'

import { getAdDisplayLabel, getInlineAdLayout } from '../ad-banner'

describe('ad banner display label', () => {
  test('uses the display domain when the ad has a URL', () => {
    expect(
      getAdDisplayLabel({
        title: 'Example Sponsor',
        url: 'https://www.example.com/path',
      }),
    ).toEqual({ text: 'example.com', variant: 'domain' })
  })

  test('uses the ad title when the ad has no URL', () => {
    expect(
      getAdDisplayLabel({
        title: 'Example Sponsor',
        url: '',
      }),
    ).toEqual({ text: 'Example Sponsor', variant: 'title' })
  })
})

describe('inline ad layout', () => {
  const ad = {
    adText:
      'Deploy frontends globally with zero config and preview every pull request.',
    title: 'Vercel',
    url: 'https://www.vercel.com/products',
  }

  test('fits the compact copy and sponsor within the card interior', () => {
    const width = 60
    const layout = getInlineAdLayout(ad, width)
    const header = `${layout.title}  Ad`
    const detail = `${layout.description}  ${layout.label} ↗`

    expect(header.length).toBeLessThanOrEqual(width - 4)
    expect(detail.length).toBeLessThanOrEqual(width - 4)
    expect(layout.title).toBe('Vercel')
    expect(layout.label).toBe('vercel.com')
    expect(layout.description.endsWith('…')).toBe(true)
  })

  test('truncates long labels without starving narrow cards', () => {
    const layout = getInlineAdLayout(
      {
        ...ad,
        url: 'https://www.extraordinarily-long-sponsor-domain.example',
      },
      48,
    )

    expect(layout.label).toBe('extraordinari…')
    expect(layout.description.length).toBeGreaterThan(0)
    expect(`${layout.title}  Ad`.length).toBeLessThanOrEqual(44)
  })

  test('prioritizes copy over the destination on very narrow cards', () => {
    const width = 47
    const layout = getInlineAdLayout(ad, width)

    expect(layout.label).toBe('')
    expect(layout.description.length).toBe(width - 4)
    expect(layout.description.endsWith('…')).toBe(true)
  })

  test('uses the full detail row when no destination domain is available', () => {
    const layout = getInlineAdLayout(
      {
        adText: 'A Carbon ad whose tracked destination is intentionally hidden.',
        title: 'Example Sponsor',
        url: '',
      },
      40,
    )

    expect(layout.title).toBe('Example Sponsor')
    expect(layout.label).toBe('')
    expect(layout.description.length).toBe(36)
  })
})
