/**
 * Bounties are paused (2026-10-13) until the program is pushed again. While
 * false, no surface lists or accepts bounties: Earn has no Bounties tab, the
 * board API returns no tasks, and claims are refused. Balances, past claims,
 * the admin queue and payouts of already-submitted claims are untouched, so
 * restoring is flipping this back. See `docs/freebuff-bounties.md`.
 */
export const FREEBUFF_BOUNTIES_ENABLED = false

/**
 * Bounties that stay off even while the program runs. A catalog id prefix
 * rather than a status edit so pausing them needs no prod write; restoring
 * is removing the prefix. Seeded Reddit bounties are `reddit-post`,
 * `reddit-comments` and `reddit-competitor-comments`.
 */
export const PAUSED_BOUNTY_ID_PREFIXES: readonly string[] = ['reddit-']

/** Whether a catalog bounty may be listed or claimed right now. */
export function isBountyListable(bountyId: string): boolean {
  return (
    FREEBUFF_BOUNTIES_ENABLED &&
    !PAUSED_BOUNTY_ID_PREFIXES.some((prefix) => bountyId.startsWith(prefix))
  )
}
