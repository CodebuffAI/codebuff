/**
 * The producer: what actually puts a sponsored proposal in the transcript
 * (COD-339).
 *
 * Before this, `fetchSponsoredProposal` had exactly one occurrence in
 * `cli/src` — its own definition. The card, its tests, its checked-in frames,
 * its transport and its five commands all shipped in Phase 1 and no CLI user
 * could ever see one, which is why the conformance matrix waived E-1, E-2 and
 * E-6 for "no producer" rather than for anything about execution.
 *
 * ## The gates, and why each one is here
 *
 * Modelled on `use-gravity-ad.ts`, because the display rail already answered
 * these questions for this surface and answering them differently would mean
 * two ad rails with two ideas of when a terminal is being used:
 *
 *  - `getAdsEnabled()` — the same switch. A user who turned ads off is not
 *    offered a sponsored task either.
 *  - an auth token — the route is authenticated, and an anonymous poll is a
 *    request that can only 401.
 *  - the first user message — nothing is fetched into an empty transcript.
 *  - ACTIVITY. `isUserActive` is the gate that matters most here: a terminal
 *    left open overnight is not a terminal to poll, and this rail costs a
 *    round trip to freebuff.com rather than a cached rotation.
 *
 * ## Two cadences, and the reason there are two
 *
 * A proposal at `offered` is an OFFER: it changes only when the server rotates
 * it, and once a minute is the right amount of attention to pay that. A row
 * with a RUN behind it is a process mutating the user's own repository, and the
 * card is the only place they can watch it — so it is polled several times a
 * minute, and the shared `sponsoredProposalAwaitsVerdict` decides which of the
 * two applies rather than a second opinion written here.
 *
 * ## The target is resolved once
 *
 * `sponsoredProposalTarget()` memoizes a single `git remote get-url origin` for
 * the life of the process. A folder with no GitHub remote answers null and gets
 * no card at all, forever, with no further git spawned.
 */
import {
  SPONSORED_STATE_IS_TERMINAL,
  sponsoredProposalAwaitsVerdict,
} from '@codebuff/common/ads/sponsored-proposal-view'
import { useEffect, useRef } from 'react'

import { getAdsEnabled } from '../commands/ads'
import { useChatStore } from '../state/chat-store'
import { isUserActive } from '../utils/activity-tracker'
import { getAuthToken } from '../utils/auth'
import { logger } from '../utils/logger'
import { getSystemMessage } from '../utils/message-history'
import { fetchSponsoredProposal } from '../utils/sponsored-proposal-api'
import { sponsoredProposalTarget } from '../utils/sponsored-proposal-target'
import { isSponsoredProposalBlock } from '../types/chat'

import type { SponsoredProposal } from '../utils/sponsored-proposal-api'
import type { ChatMessage, SponsoredProposalContentBlock } from '../types/chat'

/** An offer changes when the server rotates it. Once a minute is enough. */
export const PROPOSAL_POLL_INTERVAL_MS = 60_000
/** A run is mutating the user's repository, and the card is the only view of it. */
export const PROPOSAL_RUN_POLL_INTERVAL_MS = 8_000
/** The same idle threshold the display rail uses. */
export const PROPOSAL_ACTIVITY_THRESHOLD_MS = 30_000

/**
 * How often to ask, given what is on screen.
 *
 * Exported and pure so the cadence is testable without a timer: it is the one
 * piece of this hook that is a decision rather than plumbing.
 */
export function proposalPollIntervalMs(
  block: SponsoredProposalContentBlock | null,
): number {
  if (!block) return PROPOSAL_POLL_INTERVAL_MS
  return sponsoredProposalAwaitsVerdict(block.proposal.state, block.runStarted === true)
    ? PROPOSAL_RUN_POLL_INTERVAL_MS
    : PROPOSAL_POLL_INTERVAL_MS
}

/** The live sponsored-proposal block in a transcript, or null. */
export function findProposalBlock(
  messages: ChatMessage[],
): SponsoredProposalContentBlock | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const block of messages[i]!.blocks ?? []) {
      if (isSponsoredProposalBlock(block)) return block
    }
  }
  return null
}

/**
 * Fold a freshly polled row into the transcript.
 *
 * PURE, and exported, because this is where the two ways a poll can be wrong
 * live: replacing a card the user has already answered, and inserting a second
 * card for a repository that already has one.
 *
 * A card the user ANSWERED is never revived — `answered` stands its controls
 * down permanently and the row upstream is dismissed, so a poll that still sees
 * something is seeing a rotation the user has not been offered yet and will be
 * on the next one. A card whose row reached a TERMINAL state keeps its place
 * with the new row folded in, so `committed` and `failed` land on the card the
 * user is already looking at rather than below it.
 */
export function applyPolledProposal(
  messages: ChatMessage[],
  target: string,
  proposal: SponsoredProposal | null,
): ChatMessage[] {
  const existing = findProposalBlock(messages)
  if (!proposal) return messages
  if (existing) {
    if (existing.answered) return messages
    if (existing.target !== target) return messages
    // Same row, same state: nothing to redraw, and a new array here would
    // reflow a transcript the user is reading once every poll.
    if (
      existing.proposal._id === proposal._id &&
      existing.proposal.state === proposal.state &&
      existing.proposal.branch === proposal.branch &&
      existing.proposal.pr_url === proposal.pr_url &&
      existing.proposal.failure_reason === proposal.failure_reason
    ) {
      return messages
    }
    return messages.map((message) =>
      message.blocks?.some(isSponsoredProposalBlock)
        ? {
            ...message,
            blocks: message.blocks.map((block) =>
              isSponsoredProposalBlock(block)
                ? { ...block, proposal }
                : block,
            ),
          }
        : message,
    )
  }
  // A row that is already over is not an OFFER. Inserting a fresh card at
  // `committed` or `failed` for a run this process never started would be a
  // report about somewhere else, arriving in this transcript as news.
  if (SPONSORED_STATE_IS_TERMINAL[proposal.state]) return messages
  const block: SponsoredProposalContentBlock = {
    type: 'sponsored-proposal',
    proposal,
    target,
  }
  return [...messages, getSystemMessage([block])]
}

/**
 * Poll for this repository's sponsored proposal and keep the card current.
 *
 * Mounted from `chat.tsx` beside the display rail. Returns nothing: everything
 * it does is to the transcript, which is where the card lives.
 */
export function useSponsoredProposal(options: { enabled?: boolean } = {}): void {
  const enabled = options.enabled ?? true
  const hasUserMessaged = useChatStore((s) =>
    s.messages.some((m) => m.variant === 'user'),
  )
  // The poll reads the transcript through a ref rather than a dependency: it
  // runs on a timer, and re-arming the timer on every transcript change would
  // reset the interval on every keystroke of a streamed answer.
  const inFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !hasUserMessaged) return
    let cancelled = false

    const tick = async (): Promise<void> => {
      if (cancelled || inFlight.current) return
      inFlight.current = true
      try {
        if (!getAdsEnabled()) return
        const authToken = getAuthToken()
        if (!authToken) return
        const store = useChatStore.getState()
        const block = findProposalBlock(store.messages)
        // A RUN IS WATCHED WHETHER OR NOT THE USER IS TOUCHING THE TERMINAL.
        // The activity gate exists to stop an idle terminal fetching new
        // OFFERS; a card with a run behind it is already on screen and is owed
        // its verdict regardless.
        const watching =
          block !== null &&
          sponsoredProposalAwaitsVerdict(
            block.proposal.state,
            block.runStarted === true,
          )
        if (!watching && !isUserActive(PROPOSAL_ACTIVITY_THRESHOLD_MS)) return
        const target = await sponsoredProposalTarget()
        // No GitHub remote, no key to hang an offer on, no card. Ever, for this
        // process -- the target is memoized, so this costs nothing after the
        // first tick.
        if (!target || cancelled) return
        const proposal = await fetchSponsoredProposal(target, authToken)
        if (cancelled) return
        useChatStore
          .getState()
          .setMessages((prev) => applyPolledProposal(prev, target, proposal))
      } catch (error) {
        // This whole channel is optional, and a terminal that reports an ad
        // rail's network trouble is spending the user's attention on our
        // problem.
        logger.debug({ error }, '[sponsored-proposal] poll failed')
      } finally {
        inFlight.current = false
        if (!cancelled) schedule()
      }
    }

    // A self-rescheduling timeout rather than an interval, so the cadence can
    // change with the card's state without tearing the effect down.
    const schedule = (): void => {
      const block = findProposalBlock(useChatStore.getState().messages)
      timer.current = setTimeout(() => void tick(), proposalPollIntervalMs(block))
    }

    void tick()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, hasUserMessaged])
}
