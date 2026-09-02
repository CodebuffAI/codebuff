import { SPONSORED_ROW_FIXTURES } from '@codebuff/common/ads/__fixtures__/sponsored-proposal-rows'
import { afterEach, describe, expect, test } from 'bun:test'

import {
  handleProposalDismiss,
  handleProposalMenu,
  liveSponsoredProposal,
} from '../ads'
import { useMessageBlockStore } from '../../state/message-block-store'

import type { ChatMessage, SponsoredProposalContentBlock } from '../../types/chat'

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
    onSponsoredProposalMenu: (target, open) => calls.push(['menu', target, open]),
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
    expect(handleProposalMenu(withBlocks(proposalBlock({ answered: true })))).toBe(
      'No sponsored proposal on screen.',
    )
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
