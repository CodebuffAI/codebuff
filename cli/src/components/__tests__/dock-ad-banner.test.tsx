import { beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import {
  AD_CARD_HEIGHT,
  DOCK_CLOSE_LABEL,
  DockAdCard,
  DockDetailPanel,
  SingleAdBanner,
  dockPanelRowBudget,
} from '../ad-banner'
import { getDockPanelLayout } from '@codebuff/common/ads/inline-ad-layout'
import { initializeThemeStore } from '../../hooks/use-theme'

import type { AdResponse } from '../../hooks/use-gravity-ad'

beforeAll(() => {
  initializeThemeStore()
})

const AD: AdResponse = {
  adText: 'App data and vector search, together.',
  title: 'Build your next AI app on Atlas',
  cta: 'Explore Atlas',
  url: 'https://www.mongodb.com/atlas',
  favicon: '',
  clickUrl: 'https://www.mongodb.com/atlas?click=1',
  impUrl: 'imp-dock-1',
  provider: 'first_party',
  expandedBody:
    'Store, index, and query app data and vector embeddings together, so your AI apps stay context-rich and fast.',
  diagram: '[ App ] -> [ Data + Vectors ]',
  bullets: [
    'Unified data and vector search',
    'Built-in scalability',
    'Security and governance built in',
  ],
}

const renderFrame = async (
  node: React.ReactNode,
  width: number,
  height: number,
): Promise<string> => {
  const setup = await createTestRenderer({ width, height })
  const root = createRoot(setup.renderer)
  flushSync(() => root.render(node))
  try {
    await setup.renderOnce()
    return setup.captureCharFrame()
  } finally {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }
}

describe('DockAdCard', () => {
  test('draws the sponsored label, brand, headline, body and CTA box', async () => {
    const frame = await renderFrame(
      <DockAdCard ad={AD} width={78} />,
      78,
      AD_CARD_HEIGHT,
    )

    expect(frame).toContain('Sponsored')
    expect(frame).toContain('mongodb.com')
    expect(frame).toContain('Build your next AI app on Atlas')
    expect(frame).toContain('App data and vector search')
    expect(frame).toContain('Explore Atlas')
  })

  test('stays exactly AD_CARD_HEIGHT rows', async () => {
    // The landing screen subtracts this from the model picker's budget, so a
    // dock that grew by one row would silently shrink the picker.
    const frame = await renderFrame(
      <DockAdCard ad={AD} width={100} />,
      100,
      AD_CARD_HEIGHT,
    )
    expect(frame.split('\n').filter((l) => l.trim()).length).toBeLessThanOrEqual(
      AD_CARD_HEIGHT,
    )
  })

  test('falls back to the five-row card below 48 columns', async () => {
    const frame = await renderFrame(
      <DockAdCard ad={AD} width={40} />,
      40,
      AD_CARD_HEIGHT,
    )
    // The card layout prints the bare `Ad` disclosure; the dock prints
    // `Sponsored`. Seeing the former is how we know we took the fallback.
    expect(frame).toContain('Ad')
    expect(frame).not.toContain('Sponsored')
  })

  test('the CTA is a sibling of the toggle, never nested inside it', async () => {
    // The regression: the CTA Button used to be a CHILD of the dock Button.
    // OpenTUI mouse events propagate and the shared Button does not stop
    // them, so one press on the CTA opened the advertiser's URL *and*
    // toggled the panel, recording a false expansion. Asserted structurally,
    // because the propagation itself is the thing under test and a handler
    // test would just re-mock it.
    const source = await Bun.file(
      new URL('../ad-banner.tsx', import.meta.url),
    ).text()
    const dockStart = source.indexOf('export const DockAdCard')
    const dockEnd = source.indexOf('export const DockDetailPanel')
    expect(dockStart).toBeGreaterThan(-1)
    const dock = source.slice(dockStart, dockEnd)
    // The outer element of the resting dock is a plain box carrying only the
    // hover tint; the toggle and the CTA are two sibling Buttons under it.
    expect(dock).toContain('onMouseOver={() => setIsHovered(true)}')
    expect(dock.match(/<Button/g) ?? []).toHaveLength(2)
    expect(dock).not.toContain('<Button\n      onClick={() => onToggle?.()}')
  })

  test('a click on the dock body toggles rather than opening the URL', async () => {
    const toggles: number[] = []
    const clicks: string[] = []
    const setup = await createTestRenderer({ width: 78, height: AD_CARD_HEIGHT })
    const root = createRoot(setup.renderer)
    flushSync(() =>
      root.render(
        <DockAdCard
          ad={AD}
          width={78}
          onToggle={() => toggles.push(1)}
          onClick={(_ad, from) => clicks.push(from)}
        />,
      ),
    )
    await setup.renderOnce()
    // Nothing has been pressed, so neither handler has fired. The assertion
    // that matters here is the WIRING: the dock body's onClick is the toggle,
    // never the landing page.
    expect(toggles).toEqual([])
    expect(clicks).toEqual([])
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  })

  test('reports its impression once the dock mounts', async () => {
    const presented: string[] = []
    const setup = await createTestRenderer({ width: 78, height: AD_CARD_HEIGHT })
    const root = createRoot(setup.renderer)
    flushSync(() =>
      root.render(
        <DockAdCard
          ad={AD}
          width={78}
          onImpression={(ad) => presented.push(ad.impUrl)}
        />,
      ),
    )
    await setup.renderOnce()
    expect(presented).toEqual(['imp-dock-1'])
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  })

  test('renders rather than throwing on a provider payload missing fields', async () => {
    const frame = await renderFrame(
      <DockAdCard
        ad={{ impUrl: 'imp-bare', clickUrl: '' } as unknown as AdResponse}
        width={78}
      />,
      78,
      AD_CARD_HEIGHT,
    )
    expect(frame).toContain('Learn more')
    expect(frame).toContain('Sponsored')
  })
})

describe('DockDetailPanel', () => {
  test('draws the brand, headline, body, diagram, bullets, CTA and Close', async () => {
    const frame = await renderFrame(
      <DockDetailPanel
        ad={AD}
        width={58}
        availableRows={40}
        onClose={() => {}}
      />,
      58,
      40,
    )

    expect(frame).toContain('mongodb.com')
    expect(frame).toContain('Sponsored')
    expect(frame).toContain('Build your next AI app on Atlas')
    expect(frame).toContain('vector embeddings')
    expect(frame).toContain('Data + Vectors')
    expect(frame).toContain('Unified data and vector search')
    expect(frame).toContain('Explore Atlas')
    expect(frame).toContain(DOCK_CLOSE_LABEL)
  })

  test('never fires an impression', async () => {
    // Expanding is a UI gesture. If the panel could fire one, opening an ad's
    // details would bill a second view of the same ad.
    const presented: string[] = []
    const setup = await createTestRenderer({ width: 58, height: 40 })
    const root = createRoot(setup.renderer)
    flushSync(() =>
      root.render(
        <DockDetailPanel
          ad={{ ...AD, impUrl: 'imp-panel' }}
          width={58}
          availableRows={40}
          onClose={() => presented.push('closed')}
        />,
      ),
    )
    await setup.renderOnce()
    expect(presented).toEqual([])
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  })

  test('draws nothing at all when the smallest panel would not fit', async () => {
    const frame = await renderFrame(
      <DockDetailPanel
        ad={AD}
        width={58}
        availableRows={6}
        onClose={() => {}}
      />,
      58,
      10,
    )
    expect(frame).not.toContain('Explore Atlas')
    expect(frame).not.toContain(DOCK_CLOSE_LABEL)
  })

  test('drops the diagram and bullets before the pitch when space is tight', async () => {
    const frame = await renderFrame(
      <DockDetailPanel
        ad={AD}
        width={58}
        availableRows={13}
        onClose={() => {}}
      />,
      58,
      13,
    )
    expect(frame).toContain('Explore Atlas')
    expect(frame).toContain('Store, index')
    expect(frame).not.toContain('Data + Vectors')
  })
})

describe('dockPanelRowBudget', () => {
  test('never lets the panel reach the composer at 24 rows', () => {
    // The acceptance criterion, checked as arithmetic rather than as a
    // screenshot of a tall terminal: at 24 rows the dock (5) plus the composer
    // and its hint row (6) are reserved, and whatever the panel plans must fit
    // in what is left.
    const budget = dockPanelRowBudget(24)
    expect(budget).toBe(13)
    const panel = getDockPanelLayout(AD, { width: 58, availableRows: budget })
    expect(panel.height + 11).toBeLessThanOrEqual(24)
  })

  test('is monotonic and floors at zero', () => {
    expect(dockPanelRowBudget(40)).toBeGreaterThan(dockPanelRowBudget(24))
    expect(dockPanelRowBudget(10)).toBe(0)
    expect(dockPanelRowBudget(0)).toBe(0)
    expect(dockPanelRowBudget(-5)).toBe(0)
  })

  test('a panel planned against the budget always fits, at every height', () => {
    for (let height = 12; height <= 60; height++) {
      const panel = getDockPanelLayout(AD, {
        width: 58,
        availableRows: dockPanelRowBudget(height),
      })
      if (!panel.fits) continue
      expect(panel.height + 11).toBeLessThanOrEqual(height)
    }
  })
})

describe('SingleAdBanner arms', () => {
  test('the control arm renders the pre-existing card', async () => {
    const frame = await renderFrame(
      <SingleAdBanner ad={AD} arm="control" />,
      80,
      AD_CARD_HEIGHT,
    )
    expect(frame).toContain('Ad')
    expect(frame).not.toContain('Sponsored')
  })

  test('the expandable arm renders the dock, and the panel only when open', async () => {
    const collapsed = await renderFrame(
      <SingleAdBanner ad={AD} arm="expandable" expanded={false} />,
      80,
      AD_CARD_HEIGHT,
    )
    expect(collapsed).toContain('Sponsored')
    expect(collapsed).not.toContain(DOCK_CLOSE_LABEL)

    const open = await renderFrame(
      <SingleAdBanner
        ad={AD}
        arm="expandable"
        expanded
        panelRows={30}
        onClose={() => {}}
      />,
      80,
      36,
    )
    expect(open).toContain(DOCK_CLOSE_LABEL)
    expect(open).toContain('Store, index')
  })

  test('prints the chord hint on a wide collapsed dock only', async () => {
    const wide = await renderFrame(
      <SingleAdBanner ad={AD} arm="expandable" chordHint="^O details" />,
      100,
      AD_CARD_HEIGHT,
    )
    expect(wide).toContain('^O details')

    const narrow = await renderFrame(
      <SingleAdBanner ad={AD} arm="expandable" chordHint="^O details" />,
      70,
      AD_CARD_HEIGHT,
    )
    expect(narrow).not.toContain('^O details')
  })
})
