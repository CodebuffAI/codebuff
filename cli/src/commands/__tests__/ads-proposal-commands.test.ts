import { SPONSORED_ROW_FIXTURES } from '@codebuff/common/ads/__fixtures__/sponsored-proposal-rows'
import { afterEach, describe, expect, test } from 'bun:test'

import {
  handleProposalAccept,
  handleProposalDismiss,
  handleProposalMenu,
  handleProposalPullRequest,
  handleProposalRemoveWorktree,
  liveSponsoredProposal,
} from '../ads'
import { setSponsoredCliAvailability } from '../../utils/sponsored-availability'
import { useMessageBlockStore } from '../../state/message-block-store'

import type {
  ChatMessage,
  SponsoredProposalContentBlock,
} from '../../types/chat'

/**
 * The slash commands that replaced the card's bare keys (COD-376).
 *
 * `useKeyboard` registers a GLOBAL listener and chat's composer has one too,
 * so the card's `m` and `esc` fired alongside whatever the user was actually
 * typing. `/ads:proposal` and `/ads:dismiss-proposal` are therefore not a
 * convenience for when no card is on screen — they are the ONLY way to reach
 * the menu and the decline, which is why they need a test of their own.
 */

const proposalBlock = (
  over: Partial<SponsoredProposalContentBlock> = {},
): SponsoredProposalContentBlock => ({
  type: 'sponsored-proposal',
  target: 'acme/deploys',
  proposal: {
    ...SPONSORED_ROW_FIXTURES.offered,
    _id: 'proposal-1',
    advertiser_id: 'adv_acme',
  },
  ...over,
})

const withBlocks = (
  ...blocks: SponsoredProposalContentBlock[]
): ChatMessage[] =>
  blocks.map(
    (block, index) =>
      ({
        id: `m${index}`,
        role: 'assistant',
        content: '',
        blocks: [block],
      }) as unknown as ChatMessage,
  )

function recordCalls() {
  const calls: [string, ...unknown[]][] = []
  useMessageBlockStore.getState().setCallbacks({
    ...useMessageBlockStore.getState().callbacks,
    onSponsoredProposalMenu: (target, open) =>
      calls.push(['menu', target, open]),
    onSponsoredProposalControl: (target, control) =>
      calls.push(['control', target, control]),
  })
  return calls
}

afterEach(() => useMessageBlockStore.getState().reset())

describe('/ads:proposal', () => {
  test('opens the menu on the live card and says nothing', () => {
    const calls = recordCalls()
    expect(handleProposalMenu(withBlocks(proposalBlock()))).toBeNull()
    expect(calls).toEqual([['menu', 'acme/deploys', true]])
  })

  test('with no card on screen it explains rather than doing nothing', () => {
    const calls = recordCalls()
    expect(handleProposalMenu([])).toBe('No sponsored proposal on screen.')
    expect(calls).toEqual([])
  })

  test('an ANSWERED card is not a live card', () => {
    // A spent card is still in the transcript by design — it is never removed —
    // so "the last proposal block" is the wrong question to ask.
    const calls = recordCalls()
    expect(
      handleProposalMenu(withBlocks(proposalBlock({ answered: true }))),
    ).toBe('No sponsored proposal on screen.')
    expect(calls).toEqual([])
  })

  test('an unavailable refresh does not open stale controls', () => {
    const calls = recordCalls()
    expect(
      handleProposalMenu(
        withBlocks(proposalBlock({ refreshUnavailable: true })),
      ),
    ).toContain('Could not refresh')
    expect(calls).toEqual([])
  })

  test('the newest live card wins when the transcript holds several', () => {
    const calls = recordCalls()
    handleProposalMenu(
      withBlocks(
        proposalBlock({ target: 'old/repo', answered: true }),
        proposalBlock({ target: 'new/repo' }),
      ),
    )
    expect(calls).toEqual([['menu', 'new/repo', true]])
  })
})

describe('/ads:dismiss-proposal', () => {
  test('declines through the same control path the menu uses', () => {
    // Not a second call to the dismiss endpoint: the busy guard, the
    // `answered` bookkeeping and the failure message all live on that path,
    // and a second implementation would be a second set of rules for one
    // gesture.
    const calls = recordCalls()
    expect(handleProposalDismiss(withBlocks(proposalBlock()))).toBeNull()
    expect(calls).toEqual([['control', 'acme/deploys', 'dismiss']])
  })

  test('with no card on screen it explains rather than doing nothing', () => {
    const calls = recordCalls()
    expect(handleProposalDismiss([])).toBe('No sponsored proposal on screen.')
    expect(calls).toEqual([])
  })
})

describe('liveSponsoredProposal', () => {
  test('is null for a transcript with no proposal at all', () => {
    expect(liveSponsoredProposal([])).toBeNull()
  })
})

/**
 * Phase 2's three commands (COD-339).
 *
 * `/ads:accept-proposal` is the one that matters: it must OPEN the consent and
 * start nothing, on every path — including the ones where there is nothing to
 * consent to. The other two are the only route to the two deliberate user
 * actions after a run, and both have to be honest when there is no run.
 */
describe('the Phase 2 commands', () => {
  test('accept opens the consent, and does not answer the proposal', () => {
    setSponsoredCliAvailability('available')
    const calls = recordAcceptCalls()
    expect(handleProposalAccept(withBlocks(proposalBlock()))).toBeNull()
    expect(calls).toEqual([['accept', 'acme/deploys']])
    setSponsoredCliAvailability(null)
  })

  test('accept says why on a machine that cannot contain a run', () => {
    // COD-336 item 3, reachable from the command as well as the card: the
    // command is typed, not clicked, so it does not go through the render-time
    // gate that hides the control.
    setSponsoredCliAvailability('unavailable:windows-no-containment')
    const calls = recordAcceptCalls()
    const message = handleProposalAccept(withBlocks(proposalBlock()))
    expect(message).toContain('Windows')
    expect(calls).toEqual([])
    setSponsoredCliAvailability(null)
  })

  test('accept refuses a row that has already been answered', () => {
    setSponsoredCliAvailability('available')
    const calls = recordAcceptCalls()
    const answered = proposalBlock({
      proposal: {
        ...SPONSORED_ROW_FIXTURES.committed,
        _id: 'proposal-1',
        advertiser_id: 'adv_acme',
      },
    })
    expect(handleProposalAccept(withBlocks(answered))).toContain(
      'already been answered',
    )
    expect(calls).toEqual([])
    setSponsoredCliAvailability(null)
  })

  test('accept with no card on screen says so, and starts nothing', () => {
    setSponsoredCliAvailability('available')
    const calls = recordAcceptCalls()
    expect(handleProposalAccept([])).toBe('No sponsored proposal on screen.')
    expect(calls).toEqual([])
    setSponsoredCliAvailability(null)
  })

  test('accept is paused while the current proposal is unavailable', () => {
    setSponsoredCliAvailability('available')
    const calls = recordAcceptCalls()
    expect(
      handleProposalAccept(
        withBlocks(proposalBlock({ refreshUnavailable: true })),
      ),
    ).toContain('Could not refresh')
    expect(calls).toEqual([])
    setSponsoredCliAvailability(null)
  })

  test('the delivery commands are honest when no run has happened', async () => {
    // Reachable by typing, at any time, with no card and no run. Neither may
    // throw, and neither may imply something is in flight.
    expect(await handleProposalPullRequest()).toContain(
      'No sponsored task has run',
    )
    expect(await handleProposalRemoveWorktree()).toContain(
      'No sponsored task has run',
    )
  })
})

function recordAcceptCalls() {
  const calls: [string, ...unknown[]][] = []
  useMessageBlockStore.getState().setCallbacks({
    ...useMessageBlockStore.getState().callbacks,
    onSponsoredProposalAccept: (target) => calls.push(['accept', target]),
    onSponsoredProposalConsent: (target, approved) =>
      calls.push(['consent', target, approved]),
  })
  return calls
}

describe('the commands are reachable by typing them', () => {
  test('all six sponsored-proposal commands resolve through the registry', async () => {
    // The card owns no bare keys, so a command that is not in the registry is a
    // control the user cannot reach at all — and at twenty columns the hint
    // line has room for two of these names, so the rest are discovered by
    // typing `/ads:` and reading the menu.
    const { findCommand } = await import('../command-registry')
    for (const name of [
      'ads:proposal',
      'ads:dismiss-proposal',
      'ads:accept-proposal',
      'ads:pull-request',
      'ads:remove-worktree',
      'ads:proposals-off',
    ]) {
      expect(findCommand(name)?.name, name).toBe(name)
    }
  })
})
