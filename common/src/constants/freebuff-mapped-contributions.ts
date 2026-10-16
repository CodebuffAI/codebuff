/** A recovered project offer is bound to one immutable, prepared snapshot. */
export type MappedContributionOffer = {
  id: string
  title: string
  projectKey: string
  packageSha256: string
  commitSha: string | null
  termsVersion: string
  termsHash: string
  termsUrl: string
  status: 'pending' | 'dismissed' | 'accepted' | 'withdrawn'
  snoozedUntil: string | null
}
export type MappedContributionState = {
  offers: MappedContributionOffer[]
  nextCursor: string | null
}
export type MappedContributionRequest = (
  | {
      action: 'accept'
      id: string
      packageSha256: string
      termsVersion: string
      termsHash: string
      accepted: true
    }
  | { action: 'dismiss'; id: string; dismissalSource?: 'close' | 'not_now' }
  | { action: 'withdraw'; id: string }
  | { action: 'view'; id: string; viewId: string; surface: 'popup' | 'earn' }
) & { viewId?: string; surface?: 'popup' | 'earn' }
export type MappedContributionResponse =
  | { ok: true; status: string }
  | { ok: false; error: string }
