/**
 * The CLI's R layer of the sponsored-proposal conformance matrix (COD-376).
 *
 * Rows come from the SHARED fixtures in `@codebuff/common`, not from literals
 * here: the whole claim being tested is that three surfaces render the same
 * bytes, and a fixture written in this file would be the CLI grading its own
 * homework.
 *
 * Three widths, because a terminal is the only surface whose layout can be
 * taken away from it: 60 is a comfortable pane, 48 a split, and 20 is the floor
 * where the "SPONSORED" marker and the advertiser name must both still survive
 * -- body copy goes first, the headline last.
 *
 * TWO CHECKS ARE WAIVED HERE AND THE WAIVERS ARE ASSERTED, not just declared:
 * R-15 (a link) becomes sanitized text, and R-16/R-17 (a logo) becomes the
 * advertiser's name with no request minted. A waiver nobody tests is a gap
 * nobody notices.
 */
import {
  HOSTILE_PR_URLS,
  MALFORMED_LOGO_TOKENS,
  SPONSORED_FIXTURE_STATES,
  SPONSORED_ROW_FIXTURES,
  VALID_LOGO_TOKEN,
} from '@codebuff/common/ads/__fixtures__/sponsored-proposal-rows'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import React from 'react'

import { SponsoredProposalBlock, hintFor } from '../blocks/sponsored-proposal-block'
import { initializeThemeStore } from '../../hooks/use-theme'
import { useMessageBlockStore } from '../../state/message-block-store'

import type {
  SponsoredProposalContentBlock,
  ContentBlock,
} from '../../types/chat'
import type { SponsoredProposalRow } from '@codebuff/common/ads/sponsored-proposal-view'

beforeAll(() => {
  initializeThemeStore()
})

const WIDTHS = [20, 48, 60] as const

const blockFor = (
  row: SponsoredProposalRow,
  over: Partial<SponsoredProposalContentBlock> = {},
): SponsoredProposalContentBlock => ({
  type: 'sponsored-proposal',
  target: 'acme/deploys',
  proposal: { ...row, _id: 'proposal-1', advertiser_id: 'adv_acme' },
  ...over,
})

const render = async (
  block: SponsoredProposalContentBlock,
  width: number,
): Promise<string> => {
  const setup = await createTestRenderer({ width, height: 24 })
  const root = createRoot(setup.renderer)
  flushSync(() => {
    root.render(<SponsoredProposalBlock block={block} availableWidth={width} />)
  })
  try {
    await setup.renderOnce()
    return setup.captureCharFrame()
  } finally {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }
}

describe('every state, at every width', () => {
  for (const width of WIDTHS) {
    test(`R-1 / R-19 the disclosure and the advertiser survive at ${width} columns`, async () => {
      for (const state of SPONSORED_FIXTURE_STATES) {
        const frame = await render(blockFor(SPONSORED_ROW_FIXTURES[state]), width)
        // The two things that may never be dropped: that this is an ad, and
        // whose. At 20 columns everything else is negotiable.
        expect(frame, `${state} at ${width}`).toContain('SPONSORED')
        expect(frame, `${state} at ${width}`).toContain('Acme')
      }
    })
  }

  test('R-3 is waived: there is no Accept control in any state, at any width', async () => {
    // Phase 1's acceptance criterion, asserted rather than promised. An Accept
    // here would spawn a Cloud thread against a folder that is not a Cloud
    // project, so it is absent — not disabled, not stubbed.
    for (const state of SPONSORED_FIXTURE_STATES) {
      for (const width of WIDTHS) {
        const frame = await render(blockFor(SPONSORED_ROW_FIXTURES[state]), width)
        expect(frame, `${state} at ${width}`).not.toContain('Start sponsored thread')
        expect(frame, `${state} at ${width}`).not.toContain('Accept')
      }
    }
  })

  test('R-2 every state offers the same one decline, and names it', async () => {
    // The decline is a COMMAND, not a key. The card used to say "esc dismiss",
    // and `useKeyboard` is a global listener -- so that Esc reached the card at
    // the same time as whatever the user was actually cancelling.
    for (const state of SPONSORED_FIXTURE_STATES) {
      expect(await render(blockFor(SPONSORED_ROW_FIXTURES[state]), 60)).toContain(
        '/ads:dismiss-proposal',
      )
    }
  })
})

describe('states that carry more than a headline', () => {
  test('R-5 running renders the todo-dock vocabulary and the count', async () => {
    const frame = await render(blockFor(SPONSORED_ROW_FIXTURES.running), 60)
    expect(frame).toContain('1/3')
    expect(frame).toContain('In progress')
    expect(frame).toContain('Wire the deploy hook')
  })

  test('R-7 / R-8 / R-10 committed names the branch and claims no PR', async () => {
    const frame = await render(blockFor(SPONSORED_ROW_FIXTURES.committed), 60)
    expect(frame).toContain('sponsored/acme-deploys')
    expect(frame).toContain('Nothing was pushed')
    expect(frame).not.toContain('http')
  })

  test('R-8 an absent branch drops the clause rather than guessing one', async () => {
    const frame = await render(
      blockFor({ ...SPONSORED_ROW_FIXTURES.committed, branch: undefined }),
      60,
    )
    expect(frame).toContain('its own branch')
    expect(frame).not.toContain('sponsored/acme-deploys')
  })

  test('R-12 failed shows the reason', async () => {
    expect(await render(blockFor(SPONSORED_ROW_FIXTURES.failed), 60)).toContain(
      'Budget exceeded',
    )
  })
})

describe('the two waivers, asserted', () => {
  test('R-15 is waived: an https PR is sanitized TEXT, never a link', async () => {
    const frame = await render(blockFor(SPONSORED_ROW_FIXTURES.landed), 60)
    // A terminal cannot make a link; it can print a destination the user may
    // copy. What must still hold is that only a gated URL is ever printed.
    expect(frame).toContain('https://github.com/x/y/pull/7')
  })

  test('R-14 no hostile URL is ever printed, and the card survives', async () => {
    for (const state of ['landed', 'merged'] as const) {
      for (const pr_url of HOSTILE_PR_URLS) {
        const frame = await render(
          blockFor({ ...SPONSORED_ROW_FIXTURES[state], pr_url }),
          60,
        )
        if (pr_url.length > 0) {
          expect(frame, `${state}: ${pr_url}`).not.toContain(pr_url.slice(0, 12))
        }
        // Losing the link costs a click; losing the card would withhold the
        // news that a sponsored thread reached the user's repository.
        expect(frame, `${state}: ${pr_url}`).toContain('SPONSORED')
      }
    }
  })

  test('R-16 / R-17 are waived: no logo is fetched, and the token never appears', async () => {
    // The strongest form this surface can state it in: a valid token, three
    // malformed ones and no token at all all render the same frame.
    const noToken = await render(blockFor(SPONSORED_ROW_FIXTURES.offered), 60)
    for (const token of [VALID_LOGO_TOKEN, ...MALFORMED_LOGO_TOKENS]) {
      const frame = await render(
        blockFor({
          ...SPONSORED_ROW_FIXTURES.offered,
          advertiser_logo_token: token,
        }),
        60,
      )
      expect(frame, JSON.stringify(token)).toBe(noToken)
      expect(frame).not.toContain('creative-image')
    }
  })
})

/**
 * The frames themselves, checked in.
 *
 * The assertions above say what must be present; this says what it LOOKS like,
 * which is the half a terminal card actually gets wrong -- a clipped headline,
 * a wrapped disclosure, a step column that eats the step text. Reviewing a diff
 * of these is the only way that shows up before a user sees it.
 *
 * Regenerate deliberately: `UPDATE_PROPOSAL_FRAMES=1 bun test
 * sponsored-proposal-block`. A frame that changed without anyone intending it
 * fails here, which is the point.
 */
describe('checked-in frames', () => {
  const SNAPSHOT = join(import.meta.dir, '__snapshots__', 'sponsored-proposal-frames.txt')

  test('every state at 20, 48 and 60 columns', async () => {
    const sections: string[] = []
    for (const state of SPONSORED_FIXTURE_STATES) {
      for (const width of WIDTHS) {
        const frame = await render(blockFor(SPONSORED_ROW_FIXTURES[state]), width)
        sections.push(
          `=== ${state} @ ${width} ===\n${frame.replace(/[ \t]+$/gm, '')}`,
        )
      }
    }
    const rendered = `${sections.join('\n')}\n`
    if (process.env.UPDATE_PROPOSAL_FRAMES === '1') {
      mkdirSync(dirname(SNAPSHOT), { recursive: true })
      writeFileSync(SNAPSHOT, rendered)
    }
    expect(
      readFileSync(SNAPSHOT, 'utf8'),
      'frames changed -- review the diff, then UPDATE_PROPOSAL_FRAMES=1 to accept',
    ).toBe(rendered)
  })
})

describe('the block itself', () => {
  test('is a plain serializable block, not html', () => {
    // `HtmlContentBlock` cannot survive being written to history and read back,
    // and this card has to: a proposal outlives the turn it arrived on.
    const block: ContentBlock = blockFor(SPONSORED_ROW_FIXTURES.offered)
    expect(JSON.parse(JSON.stringify(block))).toEqual(block)
  })

  test('the hint names commands while the menu is closed, and keys while it is open', () => {
    // The closed hint may not name a bare key, because the card binds none --
    // and a hint naming a key that does nothing is worse than no hint.
    const closed = hintFor(false)
    expect(closed).toContain('/ads:proposal')
    expect(closed).toContain('/ads:dismiss-proposal')
    // Two columns of padding the card's own `inner` does not account for, so
    // the widest line it may emit is narrower than `inner` suggests.
    expect(closed.length).toBeLessThanOrEqual(44)
    for (const key of ['esc dismiss', 'm options', 'enter open PR']) {
      expect(closed).not.toContain(key)
    }
    // Naming an Accept the surface does not have is how a Phase 1 card starts
    // looking like it can run a sponsored thread.
    expect(closed.toLowerCase()).not.toContain('accept')

    // The open menu is the one span the card owns the keyboard, and chat's is
    // disabled for exactly it.
    expect(hintFor(true)).toContain('esc close')
    expect(hintFor(true).toLowerCase()).not.toContain('accept')
  })

  test('a narrow hint never clips a command mid-token', () => {
    // A truncated `/ads:dismiss-propos` teaches a command that does not exist.
    for (const width of [0, 1, 5, 13, 20, 30, 36, 37, 44]) {
      const hint = hintFor(false, width)
      expect(hint.length, `width ${width}`).toBeLessThanOrEqual(width)
      if (hint.length > 0) {
        for (const token of hint.split(' · ')) {
          expect(
            ['/ads:proposal', '/ads:dismiss-proposal'],
            `width ${width}`,
          ).toContain(token)
        }
      }
    }
  })
})

/**
 * WHAT THE CARD DOES WITH A KEYPRESS, which is the finding this section exists
 * for.
 *
 * `useKeyboard` registers a GLOBAL listener; it is not scoped to a focused
 * element. Chat's composer has a global handler of its own and does not stop
 * firing because a transcript block exists, so every bare key this card used to
 * claim reached BOTH: typing `m` into a prompt opened an ad's menu, and an Esc
 * aimed at something else was recorded as a decline the user never made.
 *
 * So while the menu is closed the card must claim NOTHING. While it is open,
 * `chat.tsx` disables the chat keyboard for exactly that span -- the same
 * `disabled` prop askUser uses -- which is what makes the arrows, Enter and Esc
 * below safe to own.
 */
describe('the card claims no bare keys while its menu is closed', () => {
  type Call = [string, ...unknown[]]

  let cleanupKeys: (() => void) | undefined
  afterEach(() => {
    cleanupKeys?.()
    cleanupKeys = undefined
  })

  const mount = async (block: SponsoredProposalContentBlock) => {
    const calls: Call[] = []
    useMessageBlockStore.getState().setCallbacks({
      ...useMessageBlockStore.getState().callbacks,
      onSponsoredProposalMenu: (target, open) =>
        calls.push(['menu', target, open]),
      onSponsoredProposalDisclose: (target, open) =>
        calls.push(['disclose', target, open]),
      onSponsoredProposalControl: (target, control) =>
        calls.push(['control', target, control]),
    })
    const setup = await createTestRenderer({
      width: 60,
      height: 24,
      // Unambiguous encoding: a bare Escape is otherwise indistinguishable
      // from the start of the next key's sequence, which is exactly the key
      // whose behaviour this section is about.
      kittyKeyboard: true,
    })
    const root = createRoot(setup.renderer)
    cleanupKeys = () => {
      flushSync(() => root.unmount())
      setup.renderer.destroy()
      useMessageBlockStore.getState().reset()
    }
    flushSync(() => {
      root.render(<SponsoredProposalBlock block={block} availableWidth={60} />)
    })
    await setup.renderOnce()

    /** Input lands on the render loop and the state it sets is committed by
     *  React's scheduler, so both drain before the next keypress. */
    const settle = async () => {
      await setup.renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 20))
      await setup.renderOnce()
    }
    await settle()
    return {
      calls,
      input: setup.mockInput,
      async press(act: () => void) {
        act()
        await settle()
      },
    }
  }

  test('m, esc, enter and the arrows all do nothing on a closed card', async () => {
    const card = await mount(blockFor(SPONSORED_ROW_FIXTURES.offered))
    await card.press(() => card.input.pressKey('m'))
    await card.press(() => card.input.pressEscape())
    await card.press(() => card.input.pressEnter())
    await card.press(() => card.input.pressArrow('down'))
    expect(card.calls).toEqual([])
  })

  test('enter does not open a pull request either, even when the row has one', async () => {
    // The one bare binding that looked harmless. It is not: Enter is the
    // composer's submit, so a landed proposal sitting in the transcript meant
    // every message the user sent also tried to launch a browser.
    const card = await mount(blockFor(SPONSORED_ROW_FIXTURES.landed))
    await card.press(() => card.input.pressEnter())
    expect(card.calls).toEqual([])
  })

  test('an OPEN menu takes the arrows and Enter', async () => {
    const card = await mount(
      blockFor(SPONSORED_ROW_FIXTURES.offered, { menuOpen: true }),
    )
    await card.press(() => card.input.pressArrow('down'))
    await card.press(() => card.input.pressEnter())
    // Down moved off `why` onto the second item, which the shared menu order
    // fixes as never-this-advertiser.
    expect(card.calls).toEqual([
      ['menu', 'acme/deploys', false],
      ['control', 'acme/deploys', 'never-advertiser'],
    ])
  })

  test('Esc closes the MENU and never answers the proposal', async () => {
    // The old binding dismissed. "I opened this by accident" is the single
    // most likely reason a user presses Esc here, and recording it as a
    // decline is an answer they did not give.
    const card = await mount(
      blockFor(SPONSORED_ROW_FIXTURES.offered, { menuOpen: true }),
    )
    await card.press(() => card.input.pressEscape())
    expect(card.calls).toEqual([['menu', 'acme/deploys', false]])
  })

  test('an answered card activates nothing, but can still close its menu', async () => {
    const card = await mount(
      blockFor(SPONSORED_ROW_FIXTURES.offered, {
        menuOpen: true,
        answered: true,
      }),
    )
    await card.press(() => card.input.pressEnter())
    expect(card.calls).toEqual([])
    await card.press(() => card.input.pressEscape())
    expect(card.calls).toEqual([['menu', 'acme/deploys', false]])
  })
})
