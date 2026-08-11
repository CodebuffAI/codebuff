/**
 * Cloudflare Worker egress detection.
 *
 * What this catches
 * -----------------
 * `pingmike2/freebuff2api-wokers` and its relatives run as a Cloudflare Worker
 * that pools harvested account tokens and resells free mode as an
 * OpenAI/Anthropic-compatible endpoint. Cloudflare stamps `CF-Worker` onto every
 * outbound subrequest a Worker makes, naming the Worker's zone, and Worker code
 * cannot remove it — the edge adds it after `fetch()` returns to the runtime.
 * The published source never references the header at all.
 *
 * Why this signal is different from the ones that went wrong before
 * ----------------------------------------------------------------
 * Every previous third-party-client detector keyed on something the CLIENT
 * chooses: `fingerprint_id` (self-reported), the tool list (they inject
 * `end_turn` to pass), the system prompt (they now send our canonical opening
 * byte-for-byte). Each was defeated within days, and one produced a
 * 659-account false-positive ban that had to be fully reversed.
 *
 * This one is stamped by OUR edge, on the request, describing the infrastructure
 * that sent it. A caller cannot remove it, and adding it falsely only implicates
 * themselves. That is what makes it safe enough to action automatically — and
 * the reason every other signal here is still only a lead.
 *
 * The three ways it could still be wrong, and what each costs
 * ----------------------------------------------------------
 * 1. **Our own infrastructure calls our own API from a Worker.** Real: the
 *    app-preview-proxy is a Cloudflare Worker. Handled by never actioning
 *    unmetered service accounts, and by the zone allowlist.
 * 2. **Cloudflare does not strip an inbound `cf-worker` from an ordinary
 *    client.** Then anyone can send it — but only on their OWN authenticated
 *    request, so they can only get themselves actioned. It is not a vector for
 *    getting someone else banned.
 * 3. **A user sits behind a corporate proxy implemented on Workers.** Rare but
 *    not impossible, and the reason `ban` is not the default mode.
 *
 * Nothing here fires on paid or BYOK traffic. The concern is subsidised
 * free-mode capacity being resold, and a paying customer routing through their
 * own Worker is doing nothing wrong.
 */

/** Header Cloudflare stamps on subrequests originating from a Worker. */
export const CF_WORKER_HEADER = 'cf-worker'

/**
 * Corroborates that the request actually traversed our edge. Without it we are
 * reading a header an arbitrary caller wrote on a request that reached the
 * origin some other way, which is not the same claim at all.
 */
export const CF_RAY_HEADER = 'cf-ray'

export type CfWorkerMode = 'off' | 'observe' | 'block' | 'ban'

export type CfWorkerVerdict =
  | { detected: false; reason: 'no_header' | 'not_edge_verified' | 'allowlisted' }
  | { detected: true; zone: string }

export type CfWorkerDetectInput = {
  /** Raw `cf-worker` value, or null/undefined when absent. */
  cfWorkerHeader: string | null | undefined
  /** Raw `cf-ray` value. Absent means the request did not come through our
   *  Cloudflare edge, so the `cf-worker` value is not ours to trust. */
  cfRayHeader: string | null | undefined
  /** Worker zones operated by us (app-preview-proxy and friends). */
  allowedZones: ReadonlySet<string>
}

/**
 * Pure detection. No I/O, so the exact decision can be replayed offline when
 * auditing a ban — a verdict that cannot be reproduced cannot be defended.
 */
export function detectCfWorker(input: CfWorkerDetectInput): CfWorkerVerdict {
  const raw = input.cfWorkerHeader?.trim()
  if (!raw) return { detected: false, reason: 'no_header' }

  // Require edge corroboration. A `cf-worker` on a request that never touched
  // Cloudflare is caller-authored noise, and treating it as proof would make
  // this detector exactly as forgeable as the ones it replaces.
  if (!input.cfRayHeader?.trim()) {
    return { detected: false, reason: 'not_edge_verified' }
  }

  const zone = raw.toLowerCase()
  if (input.allowedZones.has(zone)) {
    return { detected: false, reason: 'allowlisted' }
  }

  return { detected: true, zone }
}

/**
 * Evidence recorded with every automated action, and shown verbatim in the ban
 * review dashboard.
 *
 * Deliberately everything needed to re-derive the verdict without the original
 * request: the zone, the edge ray id (so the request can be found in Cloudflare
 * logs), and the calling client's self-description. A reviewer who cannot see
 * why an account was banned cannot tell a true positive from a false one, which
 * is how the 2026-08-03 sweep ended up reversed in full.
 */
export type CfWorkerEvidence = {
  zone: string
  cfRay: string | null
  /** `codebuff_metadata.client_id`. The published proxy sends `wf-` + 8 base36
   *  characters; our own clients send a different shape entirely. */
  clientId: string | null
  userAgent: string | null
  model: string | null
  agentId: string | null
  endpoint: string
  detectedAt: string
}

/** Parse the operator-configured allowlist of our own Worker zones. */
export function parseAllowedWorkerZones(
  raw: string | null | undefined,
): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((zone) => zone.trim().toLowerCase())
      .filter((zone) => zone.length > 0),
  )
}

/** A caller-supplied `client_id` matching the published proxy's generator.
 *  Corroboration only — never a reason to action on its own, because it is
 *  client-controlled and therefore trivially changed the moment it is used. */
export function looksLikeProxyClientId(clientId: string | null | undefined): boolean {
  return typeof clientId === 'string' && /^wf-[a-z0-9]{8}$/.test(clientId)
}
