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
import type { FreebuffSessionServerResponse } from '@codebuff/common/types/freebuff-session'

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

export interface FreebuffTierInfo {
  accessTier: FreebuffAccessTier
}

/** The session lifecycle surface the ThreadEngine depends on. Implemented by
 *  {@link FreebuffSessionManager}; tests inject a stub so turns don't hit the
 *  network. */
export interface FreebuffSessions {
  getAccessTier(): FreebuffAccessTier
  fetchTier(): Promise<FreebuffTierInfo>
  ensure(threadId: string, model: string, instanceId?: string): Promise<string>
  release(threadId: string, instanceId?: string): Promise<void>
  releaseAll(): Promise<void>
}

export class FreebuffSessionManager implements FreebuffSessions {
  private readonly instanceByThread = new Map<string, string>()
  private accessTier: FreebuffAccessTier = 'full'

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
    if (!token) {
      throw new FreebuffSessionError(
        'unauthenticated',
        'Sign in to Freebuff to use the hosted agent.',
      )
    }
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
      if ('accessTier' in body && body.accessTier) {
        this.accessTier = body.accessTier
      }
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
    if (body && 'accessTier' in body && body.accessTier) {
      this.accessTier = body.accessTier
    }
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
    switch (body?.status) {
      case 'premium_slot_taken':
        return new FreebuffSessionError(
          status,
          `Another tab is using a premium model (${body.currentModel}). Switch this tab to an unlimited model, or change the other tab.`,
          {
            currentModel: body.currentModel,
            currentInstanceId: body.currentInstanceId,
          },
        )
      case 'rate_limited':
        return new FreebuffSessionError(
          status,
          `Daily limit reached for ${body.model}. Try an unlimited model or come back after the reset.`,
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
