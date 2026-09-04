/**
 * Whether a sponsored task can run on THIS machine, asked from the render path
 * (COD-339).
 *
 * A separate module from `sponsored-run.ts` because the card asks it on every
 * draw and `sponsored-run.ts` pulls in the SDK's tool implementations, the
 * client and the git runner. This is the pure question plus one memoized disk
 * probe.
 *
 * MEMOIZED: the answer is a property of the operating system and, on Linux, of
 * whether `bwrap` is installed. Neither changes under a running terminal in a
 * way worth re-probing sixty times a second.
 */
import {
  SPONSORED_LOCAL_UNAVAILABLE_COPY,
  sponsoredLocalAvailability,
  sponsoredLocalUnavailableReason,
} from '@codebuff/common/ads/sponsored-local-execution'

import { sponsoredContainment } from '../../../sdk/src/tools/sponsored-sandbox'

import type { SponsoredLocalAvailability } from '@codebuff/common/ads/sponsored-local-execution'

let cached: SponsoredLocalAvailability | null = null

export function sponsoredCliAvailability(): SponsoredLocalAvailability {
  if (cached === null) {
    cached = sponsoredLocalAvailability(sponsoredContainment(process.platform))
  }
  return cached
}

export function sponsoredCliCanRun(): boolean {
  return sponsoredCliAvailability() === 'available'
}

/**
 * The sentence to show instead of an Accept, or null when there is one.
 *
 * The copy is the SHARED copy, so a Windows user reads the same refusal in the
 * terminal that they would read on the Desktop card — and so the reason a
 * terminal cannot run a task is never a sentence a terminal wrote for itself.
 */
export function sponsoredCliUnavailableCopy(): string | null {
  const reason = sponsoredLocalUnavailableReason(sponsoredCliAvailability())
  return reason === null ? null : SPONSORED_LOCAL_UNAVAILABLE_COPY[reason]
}

/**
 * Test-only: pin the answer, or (with `null`) forget the probe.
 *
 * The card's Accept is gated on this, so the Windows refusal and the ordinary
 * macOS card are two renders of the same component — and a test that could only
 * observe the host's own platform would assert one of them on a Mac and the
 * other in CI, which is not a test of either.
 */
export function setSponsoredCliAvailability(
  value: SponsoredLocalAvailability | null,
): void {
  cached = value
}
