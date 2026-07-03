/**
 * Per-tab Freebuff free-mode session lifecycle for the desktop.
 *
 * The desktop runs each tab as an independent free-mode session via the backend
 * multi-session mode (one premium-bucket session + N unlimited per user). This
 * manager owns, for each thread:
 *   - a stable per-tab instance id (so GET/DELETE address the same desktop row),
 *   - admission (`ensure`) before a turn runs: a POST /api/v1/freebuff/session
 *     carrying the multi-session header, which the chat-completions gate then
 *     validates against via `freebuff_instance_id` + `freebuff_multi_session`,
 *   - release (`release`) when the tab closes or switches model.
 *
 * Admission is lazy (per turn) and idempotent: the server's reclaim path
 * refreshes the session window without re-counting the daily quota, so calling
 * `ensure` every turn is safe and also re-creates a session the server swept.
 *
 * Unlike the CLI there is no polling loop — idle tabs hold no live poller.
 */

import {
  FREEBUFF_INSTANCE_HEADER as INSTANCE_HEADER,
  FREEBUFF_MODEL_HEADER as MODEL_HEADER,
  FREEBUFF_MULTI_SESSION_HEADER as MULTI_SESSION_HEADER,
} from '@codebuff/common/constants/freebuff-models'
import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import { getRateLimitsByModel } from '@codebuff/common/types/freebuff-session'
import type {
  FreebuffSessionRateLimitByModel,
  FreebuffSessionServerResponse,
} from '@codebuff/common/types/freebuff-session'

import { API_HOST } from '../api-host'

function sessionEndpoint(): string {
  return `${API_HOST}/api/v1/freebuff/session`
}

/** Thrown by `ensure` when a session can't be admitted. `status` mirrors the
 *  server response status (`premium_slot_taken`, `rate_limited`, `banned`,
 *  `country_blocked`, `model_unavailable`) or a client-side `unauthenticated`. */
export class FreebuffSessionError extends Error {
  constructor(
    public readonly status: string,
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'FreebuffSessionError'
  }
}

/** The "no usable sign-in" rejection. One constructor shared by the admission
 *  path (authHeader below) and CodebuffHarness's null-client guard, so every
 *  signed-out surface throws the identical error and renders the same sign-in
 *  recovery card. */
export function unauthenticatedError(): FreebuffSessionError {
  return new FreebuffSessionError(
    'unauthenticated',
    'Sign in to Freebuff to use the hosted agent.',
  )
}

export interface FreebuffTierInfo {
  accessTier: FreebuffAccessTier
}

/** The session lifecycle surface the ThreadEngine depends on. Implemented by
 *  {@link FreebuffSessionManager}; tests inject a stub so turns don't hit the
 *  network. */
export interface FreebuffSessions {
  getAccessTier(): FreebuffAccessTier
  /** Latest per-model session-quota snapshot (limit + used) observed on any
   *  session response, or null before the first probe. Only quota-metered
   *  models appear (premium pool on full tier; every model on limited tier). */
  getRateLimits(): FreebuffSessionRateLimitByModel | null
  fetchTier(): Promise<FreebuffTierInfo>
  ensure(threadId: string, model: string, instanceId?: string): Promise<string>
  release(threadId: string, instanceId?: string): Promise<void>
  releaseAll(): Promise<void>
}

export class FreebuffSessionManager implements FreebuffSessions {
  private readonly instanceByThread = new Map<string, string>()
  private accessTier: FreebuffAccessTier = 'full'
  private rateLimits: FreebuffSessionRateLimitByModel | null = null

  /** `onAuthRejected` fires when the API answers 401 — the bearer we hold is
   *  expired/revoked, so the owner should treat it as a sign-out (clear the
   *  persisted identity and flip the header to the sign-in gate). */
  constructor(
    private readonly getToken: () => string | undefined,
    private readonly onAuthRejected?: () => void,
  ) {}

  /** The most recently observed access tier (default 'full' until first probe). */
  getAccessTier(): FreebuffAccessTier {
    return this.accessTier
  }

  /** The most recently observed per-model quota snapshot (see interface doc). */
  getRateLimits(): FreebuffSessionRateLimitByModel | null {
    return this.rateLimits
  }

  /** Fold tier + quota off any session response body. Every GET/POST lands
   *  here so the header badge stays live without a dedicated poll: the daily
   *  count only changes on admission (POST) or day rollover (refreshed by the
   *  next GET probe / turn). The cached map is replaced only when its content
   *  actually changed, so callers can cheaply detect "quota moved" by
   *  reference comparison (the engine skips a snapshot broadcast otherwise). */
  private absorb(body: FreebuffSessionServerResponse | undefined): void {
    if (!body) return
    if ('accessTier' in body && body.accessTier) {
      this.accessTier = body.accessTier
    }
    const incoming = getRateLimitsByModel(body)
    if (incoming && JSON.stringify(incoming) !== JSON.stringify(this.rateLimits)) {
      this.rateLimits = incoming
    }
    // A daily-pool reject carries the freshest count. All models in the cached
    // map share ONE pool per tier (the server builds every entry from the same
    // snapshot), so the fold updates every entry — a sibling tab's badge on
    // another premium model flips to exhausted too. Gated on the rejected model
    // already being cached: a reject for an unmetered model (e.g. an old
    // server's concurrency backstop, which predates `reason`) must not invent
    // a bogus quota entry for a model that has no daily pool.
    if (
      body.status === 'rate_limited' &&
      !body.reason &&
      this.rateLimits?.[body.model]
    ) {
      const { limit, period, resetTimeZone, resetAt, windowHours, recentCount } = body
      this.rateLimits = Object.fromEntries(
        Object.keys(this.rateLimits).map((model) => [
          model,
          { model, limit, period, resetTimeZone, resetAt, windowHours, recentCount },
        ]),
      )
    }
  }

  private instanceFor(threadId: string, preferred?: string): string {
    if (preferred) {
      this.instanceByThread.set(threadId, preferred)
      return preferred
    }
    let id = this.instanceByThread.get(threadId)
    if (!id) {
      id = crypto.randomUUID()
      this.instanceByThread.set(threadId, id)
    }
    return id
  }

  private authHeader(): string {
    const token = this.getToken()
    if (!token) throw unauthenticatedError()
    return `Bearer ${token}`
  }

  /** Probe the user's access tier + quota without binding to a tab. Used at
   *  startup / after login to drive the model picker. Best-effort: returns the
   *  cached tier on any error. */
  async fetchTier(): Promise<FreebuffTierInfo> {
    try {
      const res = await fetch(sessionEndpoint(), {
        method: 'GET',
        headers: {
          Authorization: this.authHeader(),
          [MULTI_SESSION_HEADER]: '1',
        },
      })
      if (res.status === 401) {
        this.onAuthRejected?.()
        return { accessTier: this.accessTier }
      }
      const body = (await res.json()) as FreebuffSessionServerResponse
      this.absorb(body)
      return { accessTier: this.accessTier }
    } catch {
      return { accessTier: this.accessTier }
    }
  }

  /**
   * Admit (or refresh) this thread's session for `model` and return the instance
   * id to forward as `freebuff_instance_id`. Throws FreebuffSessionError on a
   * non-active outcome so the engine can surface a friendly message.
   */
  async ensure(threadId: string, model: string, preferredInstanceId?: string): Promise<string> {
    const instanceId = this.instanceFor(threadId, preferredInstanceId)
    const res = await fetch(sessionEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        [MODEL_HEADER]: model,
        [INSTANCE_HEADER]: instanceId,
        [MULTI_SESSION_HEADER]: '1',
      },
    })
    if (res.status === 401) {
      this.onAuthRejected?.()
      throw new FreebuffSessionError(
        'unauthenticated',
        'Your Freebuff sign-in expired. Sign in again.',
      )
    }
    const body = (await res.json().catch(() => ({}))) as FreebuffSessionServerResponse
    this.absorb(body)
    if (body?.status === 'active') {
      return instanceId
    }
    throw this.errorFor(body, model)
  }

  /** End this tab's session (best-effort). Frees the premium slot if held. */
  async release(threadId: string, knownInstanceId?: string): Promise<void> {
    const instanceId = knownInstanceId ?? this.instanceByThread.get(threadId)
    if (!instanceId) return
    this.instanceByThread.delete(threadId)
    try {
      await fetch(sessionEndpoint(), {
        method: 'DELETE',
        headers: {
          Authorization: this.authHeader(),
          [INSTANCE_HEADER]: instanceId,
          [MULTI_SESSION_HEADER]: '1',
        },
      })
    } catch {
      // Best-effort: a failed release just leaves the row to expire/sweep.
    }
  }

  /** End every tab's session (logout / shutdown). */
  async releaseAll(): Promise<void> {
    const ids = [...this.instanceByThread.keys()]
    await Promise.all(ids.map((threadId) => this.release(threadId)))
  }

  private errorFor(
    body: FreebuffSessionServerResponse | undefined,
    model: string,
  ): FreebuffSessionError {
    const status = body?.status ?? 'error'
    // ensure() runs absorb(body) before building the error, so the manager's
    // tier already reflects this response — one source of truth, no re-derive.
    const tier = this.accessTier
    switch (body?.status) {
      case 'premium_slot_taken':
        return new FreebuffSessionError(
          status,
          // On the limited tier every model shares the single slot, so "switch
          // to an unlimited model" would point at models the tier doesn't have.
          tier === 'limited'
            ? `Freebuff is limited to one tab at a time on your network. Another tab is running ${body.currentModel} — use that tab, or close it and try again.`
            : `Another tab is using a premium model (${body.currentModel}). Switch this tab to an unlimited model, or change the other tab.`,
          {
            currentModel: body.currentModel,
            currentInstanceId: body.currentInstanceId,
          },
        )
      case 'rate_limited':
        // Any `reason`-tagged reject is NOT a daily quota (today the only value
        // is the concurrent-tab backstop; a future reason must at least not be
        // misreported as "come back tomorrow" — closing tabs fixes it now).
        if (body.reason) {
          return new FreebuffSessionError(
            status,
            `Too many tabs are running Freebuff models at once (max ${body.limit}). Close a tab and try again.`,
            { reason: body.reason, limit: body.limit },
          )
        }
        return new FreebuffSessionError(
          status,
          tier === 'limited'
            ? `Daily free limit reached for ${body.model}. Come back after the daily reset.`
            : `Daily limit reached for ${body.model}. Try an unlimited model or come back after the reset.`,
          { resetAt: body.resetAt },
        )
      case 'model_unavailable':
        return new FreebuffSessionError(
          status,
          `${body.requestedModel} isn't available right now (${body.availableHours}).`,
        )
      case 'banned':
        return new FreebuffSessionError(status, 'This account is not allowed to use free mode.')
      case 'country_blocked':
        return new FreebuffSessionError(
          status,
          'Free mode is not available from your current network.',
        )
      default:
        return new FreebuffSessionError(status, `Could not start a Freebuff session for ${model}.`)
    }
  }
}
