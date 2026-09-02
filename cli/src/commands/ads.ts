import { useChatStore } from '../state/chat-store'
import { useMessageBlockStore } from '../state/message-block-store'
import { IS_FREEBUFF } from '../utils/constants'
import { logger } from '../utils/logger'
import { getSystemMessage } from '../utils/message-history'
import { saveSettings, loadSettings } from '../utils/settings'

import { getAuthToken } from '../utils/auth'
import { setSponsoredProposalPrefs } from '../utils/sponsored-proposal-api'
import { runSponsoredProposalControl } from '../utils/sponsored-proposal-control'
import { isSponsoredProposalBlock } from '../types/chat'

import type {
  ChatMessage,
  SponsoredProposalContentBlock,
} from '../types/chat'

export const handleAdsEnable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  logger.info('[gravity] Enabling ads')

  saveSettings({ adsEnabled: true })

  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads enabled. You will see contextual ads above the input and in the chat.'),
    ],
  }
}

export const handleAdsDisable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  logger.info('[gravity] Disabling ads')
  saveSettings({ adsEnabled: false })

  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads disabled.'),
    ],
  }
}

export const getAdsEnabled = (): boolean => {
  if (IS_FREEBUFF) return true

  // Codebuff LITE is a paid mode now, so use the normal saved setting.
  const settings = loadSettings()
  return settings.adsEnabled ?? false
}

/**
 * The sponsored-proposal channel controls, reachable from `/ads` as well as
 * from the card (COD-376).
 *
 * They are on the card because that is where the user is when they want them,
 * and here because a card can be scrolled off, dismissed, or never shown --
 * and "turn this off" must not require an ad to be on screen to reach. The
 * two paths call the same endpoints.
 *
 * Report and never-this-advertiser need a proposal to be ABOUT, so they act on
 * the live card and say so plainly when there is none. The channel opt-out
 * needs nothing and always works.
 */

/** The live (unanswered) sponsored proposal in the transcript, or null. */
export function liveSponsoredProposal(
  messages: ChatMessage[],
): SponsoredProposalContentBlock | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const block of messages[i]!.blocks ?? []) {
      if (isSponsoredProposalBlock(block) && !block.answered) return block
    }
  }
  return null
}

async function withProposal(
  messages: ChatMessage[],
  act: (
    block: SponsoredProposalContentBlock,
    authToken: string,
  ) => Promise<boolean>,
  done: string,
): Promise<string> {
  const block = liveSponsoredProposal(messages)
  if (!block) return 'No sponsored proposal on screen.'
  const authToken = getAuthToken()
  if (!authToken) return 'Sign in to change sponsored proposal settings.'
  return (await act(block, authToken))
    ? done
    : 'Could not reach the sponsored proposal service. Try again.'
}

/**
 * `/ads:proposal` — open the channel menu on the card that is on screen.
 *
 * THE ONLY WAY IN, since COD-376's review: the card used to bind a bare `m`,
 * and `useKeyboard` is a GLOBAL listener rather than a focus-scoped one, so
 * that letter reached the ad menu at the same time as the composer it was
 * typed into. A slash command is the gesture a terminal already has for
 * "address the client, not the prompt".
 *
 * Returns null when it did something: opening a menu is visible on its own and
 * a system line saying so would push the card it refers to further up the
 * transcript.
 */
export function handleProposalMenu(messages: ChatMessage[]): string | null {
  const block = liveSponsoredProposal(messages)
  if (!block) return 'No sponsored proposal on screen.'
  useMessageBlockStore
    .getState()
    .callbacks.onSponsoredProposalMenu(block.target, true)
  return null
}

/**
 * `/ads:dismiss-proposal` — decline the card on screen.
 *
 * Goes through the SAME control path the menu uses rather than calling the
 * dismiss endpoint here, so the busy guard, the `answered` bookkeeping and the
 * failure message are the ones the card already has. A second implementation
 * would be a second set of rules for the same gesture.
 */
export function handleProposalDismiss(messages: ChatMessage[]): string | null {
  const block = liveSponsoredProposal(messages)
  if (!block) return 'No sponsored proposal on screen.'
  useMessageBlockStore
    .getState()
    .callbacks.onSponsoredProposalControl(block.target, 'dismiss')
  return null
}

export const handleProposalReport = (
  messages: ChatMessage[],
): Promise<string> =>
  withProposal(
    messages,
    (block, authToken) =>
      runSponsoredProposalControl(
        'report',
        {
          proposalId: block.proposal._id,
          advertiserId: block.proposal.advertiser_id,
        },
        authToken,
      ),
    'Reported. Thanks — we review every report.',
  )

export const handleProposalNeverAdvertiser = (
  messages: ChatMessage[],
): Promise<string> =>
  withProposal(
    messages,
    // THE SAME helper the card's menu runs, so the preference-before-dismiss
    // ordering and its result-gating have one implementation. Two would drift,
    // and the drift would be silent: both paths succeed on the happy path.
    (block, authToken) =>
      runSponsoredProposalControl(
        'never-advertiser',
        {
          proposalId: block.proposal._id,
          advertiserId: block.proposal.advertiser_id,
        },
        authToken,
      ),
    'You will not see proposals from this advertiser again.',
  )

/**
 * Turns sponsored PROPOSALS off. Deliberately separate from `/ads:disable`,
 * which is the display rail: the two are different channels with different
 * controls, and one switch for both would turn off something the user did not
 * ask about.
 */
export const handleProposalsOff = async (): Promise<string> => {
  const authToken = getAuthToken()
  if (!authToken) return 'Sign in to change sponsored proposal settings.'
  return (await setSponsoredProposalPrefs({ optedOut: true }, authToken))
    ? 'Sponsored proposals are off. This does not change other ads.'
    : 'Could not reach the sponsored proposal service. Try again.'
}
