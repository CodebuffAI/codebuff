import { describe, expect, test } from 'bun:test'

import { getInlineAdLayout } from '../../ads/inline-ad-layout'
import {
  PLACEMENT_PREVIEW_WIDTHS,
  PLACEMENT_SLOTS,
} from '../freebuff-placements'
import {
  HOUSE_AD_CREATIVES,
  HOUSE_AD_DESTINATION_URL,
  HOUSE_AD_DISPLAY_CREATIVE,
  HOUSE_AD_DISPLAY_VARIATIONS,
  HOUSE_AD_TEXT_BUDGET,
  HOUSE_AD_TITLE_BUDGET,
  HOUSE_AD_VARIATIONS,
} from '../freebuff-house-ad'

import type { HouseAdCreative, HouseAdSurface } from '../freebuff-house-ad'

/**
 * The subscription promotion's copy.
 *
 * The point of these tests is that the width budget is CHECKED rather than
 * remembered. Every inline creative here is written to a character count taken
 * from the real renderer, and three things move it without anyone touching this
 * copy: the layout function, the preview widths, and the subscription price
 * (which is interpolated, so `$8/mo` becoming `$10/mo` lengthens every line).
 * Each of those is a silent truncation waiting to happen, so each is asserted.
 */

/**
 * The width from which a description must render uncut.
 *
 * Matches `MIN_INLINE_WIDTH_WITH_DESTINATION` in the layout module by
 * coincidence of design rather than by import: that constant is about whether
 * the destination label is drawn, and this is about what we hold our own copy
 * to. Tying them together would make a change to one silently move the other.
 */
const DESCRIPTION_ENFORCED_FROM = 48

const SURFACES: HouseAdSurface[] = [
  'cli_chat',
  'waiting_room',
  'freebuff_web_chat',
  'chat_assistant',
]

const everyInlineCreative = (): Array<{
  surface: HouseAdSurface
  index: number
  creative: HouseAdCreative
}> =>
  SURFACES.flatMap((surface) =>
    HOUSE_AD_VARIATIONS[surface].map((creative, index) => ({
      surface,
      index,
      creative,
    })),
  )

describe('house ad width budget', () => {
  test('the declared budgets match what the renderer actually gives', () => {
    // Recomputed from `getInlineAdLayout` rather than asserted as literals, so
    // a layout change fails HERE -- naming the constant to update -- instead of
    // silently cutting live copy. A long probe string is truncated to exactly
    // the available width, which is what makes the returned length the budget.
    const probe = {
      title: 'T'.repeat(200),
      adText: 'D'.repeat(200),
      url: HOUSE_AD_DESTINATION_URL,
    }

    const narrowest = Math.min(...PLACEMENT_PREVIEW_WIDTHS)
    expect(getInlineAdLayout(probe, narrowest).title).toHaveLength(
      HOUSE_AD_TITLE_BUDGET,
    )

    // The description budget is the narrowest width a description is REQUIRED
    // to survive, which is 48 rather than 20 -- at 20 the description gets 16
    // characters and no sentence survives, so that width is a degraded render
    // by policy. Asserted as the minimum over the widths at or above the
    // threshold, so adding a 40-column preview tightens this instead of being
    // quietly ignored.
    const enforcedWidths = PLACEMENT_PREVIEW_WIDTHS.filter(
      (width) => width >= DESCRIPTION_ENFORCED_FROM,
    )
    expect(enforcedWidths.length).toBeGreaterThan(0)
    const worstDescription = Math.min(
      ...enforcedWidths.map(
        (width) => getInlineAdLayout(probe, width).description.length,
      ),
    )
    expect(worstDescription).toBe(HOUSE_AD_TEXT_BUDGET)
  })

  test.each(everyInlineCreative())(
    '$surface variation $index survives every preview width uncut',
    ({ creative }) => {
      expect(creative.title.length).toBeLessThanOrEqual(HOUSE_AD_TITLE_BUDGET)
      expect(creative.adText.length).toBeLessThanOrEqual(HOUSE_AD_TEXT_BUDGET)

      // The budgets above are the arithmetic; this is the renderer's own
      // verdict. A creative passes only if what the reader sees is the string
      // we wrote -- no ellipsis, at any width the console previews.
      for (const width of PLACEMENT_PREVIEW_WIDTHS) {
        const layout = getInlineAdLayout(creative, width)
        expect(layout.title).toBe(creative.title)
        // Below 48 the description genuinely cannot hold a sentence from
        // anybody, so it is allowed to truncate there and nowhere else.
        if (width >= DESCRIPTION_ENFORCED_FROM) {
          expect(layout.description).toBe(creative.adText)
        }
      }
    },
  )
})

describe('house ad catalog', () => {
  test('every surface has variations for the CTR bias to choose between', () => {
    // One creative is a campaign the optimizer cannot improve: it would be
    // exactly as good as whichever line was written first.
    for (const surface of SURFACES) {
      expect(HOUSE_AD_VARIATIONS[surface].length).toBeGreaterThan(1)
    }
  })

  test('variations within a surface are distinct', () => {
    for (const surface of SURFACES) {
      const rendered = HOUSE_AD_VARIATIONS[surface].map(
        (creative) => `${creative.title}|${creative.adText}`,
      )
      expect(new Set(rendered).size).toBe(rendered.length)
    }
  })

  test('the floor serves variation 0 of its surface', () => {
    // The floor and the campaign must not drift into two different products.
    for (const surface of SURFACES) {
      expect(HOUSE_AD_CREATIVES[surface]).toBe(HOUSE_AD_VARIATIONS[surface][0]!)
    }
    expect(HOUSE_AD_DISPLAY_CREATIVE).toBe(HOUSE_AD_DISPLAY_VARIATIONS[0]!)
  })

  test('every sellable slot belongs to a surface that has copy', () => {
    // The seed script groups slots by surface and skips a surface it has no
    // creatives for. Without this, adding a slot on a new surface would leave
    // that surface out of the campaign silently -- the run would report
    // success and the slot would keep rendering empty.
    const surfacesWithSlots = new Set(
      PLACEMENT_SLOTS.filter((slot) => slot.available).map(
        (slot) => slot.surface,
      ),
    )
    for (const surface of surfacesWithSlots) {
      expect(HOUSE_AD_VARIATIONS[surface as HouseAdSurface]).toBeDefined()
    }
  })

  test('every surface with copy has a slot to serve it into', () => {
    // The other direction: copy written for a surface nothing targets is copy
    // that can only ever reach the floor, never the campaign.
    for (const surface of SURFACES) {
      const slots = PLACEMENT_SLOTS.filter(
        (slot) => slot.surface === surface && slot.available,
      )
      expect(slots.length).toBeGreaterThan(0)
    }
  })

  test('no creative claims a benefit the subscription does not deliver', () => {
    // The first version of this copy sold "no ads" and "skip the queue". A
    // subscription does NEITHER: nothing on any serve path reads subscription
    // status, so a subscriber sees the same ads as everybody else, and the
    // `waiting_room` surface is the CLI landing screen rather than an
    // admission queue. Both claims survived a width-budget test, a typecheck
    // and a review, because none of those can tell whether a sentence is TRUE.
    //
    // This is the check that can. Adding a claim here means first adding the
    // code that makes it real.
    const FALSE_CLAIMS = [
      /no ads/i,
      /ad-free/i,
      /adfree/i,
      /without ads/i,
      /skip the queue/i,
      /no queue/i,
      /no wait/i,
      /no waiting/i,
      /jump the/i,
      /starts? (right )?now/i,
      /instant/i,
    ]
    const everyCreative = [
      ...everyInlineCreative().map(({ creative }) => creative),
      ...HOUSE_AD_DISPLAY_VARIATIONS,
    ]
    for (const creative of everyCreative) {
      const copy = `${creative.title} ${creative.adText}`
      for (const claim of FALSE_CLAIMS) {
        expect(copy).not.toMatch(claim)
      }
    }
  })

  test('every creative sends the reader to the plans page', () => {
    for (const { creative } of everyInlineCreative()) {
      expect(creative.url).toBe(HOUSE_AD_DESTINATION_URL)
      expect(creative.cta.length).toBeGreaterThan(0)
      expect(creative.favicon).toStartWith('https://')
    }
    for (const creative of HOUSE_AD_DISPLAY_VARIATIONS) {
      expect(creative.url).toBe(HOUSE_AD_DESTINATION_URL)
      // The card surface is the one that renders an image; an absent one would
      // leave a blank panel where the creative is meant to be.
      expect(creative.imageUrl).toStartWith('https://')
    }
  })
})
