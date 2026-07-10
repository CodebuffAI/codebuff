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
    const rendered = `Ad · ${layout.description}  ${layout.label} ↗`

    expect(rendered.length).toBeLessThanOrEqual(width - 4)
    expect(layout.label).toBe('vercel.com')
    expect(layout.description.endsWith('…')).toBe(true)
  })

  test('truncates long labels without starving narrow cards', () => {
    const layout = getInlineAdLayout(
      {
        ...ad,
        url: 'https://www.extraordinarily-long-sponsor-domain.example',
      },
      20,
    )

    expect(layout.label).toBe('extr…')
    expect(layout.description.length).toBeGreaterThan(0)
  })
})
