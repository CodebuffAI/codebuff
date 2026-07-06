import { ConvexClient, ConvexHttpClient } from 'convex/browser'

import type { FunctionReference } from 'convex/server'

/**
 * The subset of a Convex ActionCtx the ported run loop uses, implemented over
 * HTTP against the deployment. `storage` round-trips through the
 * runner_bridge storage helpers because only Convex functions can mint
 * upload/download URLs.
 *
 * Auth: a deploy key (admin) so internal functions are callable. The key
 * lives only in the runner's Render env.
 */
export type RunnerCtx = {
  runQuery: <T = any>(ref: FunctionReference<any, any>, args: any) => Promise<T>
  runMutation: <T = any>(ref: FunctionReference<any, any>, args: any) => Promise<T>
  runAction: <T = any>(ref: FunctionReference<any, any>, args: any) => Promise<T>
  storage: {
    get: (storageId: string) => Promise<Blob | null>
    store: (blob: Blob) => Promise<string>
    delete: (storageId: string) => Promise<void>
    getUrl: (storageId: string) => Promise<string | null>
  }
}

// Transient-failure retry for the HTTP hop. Only retries when the request
// never reached Convex (network/fetch errors) — a thrown application error is
// surfaced immediately, and we never blind-retry mutations that may have
// committed (double-applied stream deltas are worse than a dropped flush).
async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const isNetwork =
        error instanceof TypeError || /fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(message)
      if (!isNetwork) throw error
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw lastError
}

export function createRunnerCtx(params: {
  convexUrl: string
  deployKey: string
  bridge: {
    generateRunnerUploadUrl: FunctionReference<any, any>
    getStorageUrl: FunctionReference<any, any>
    deleteStorageBlob: FunctionReference<any, any>
  }
}): RunnerCtx {
  const http = new ConvexHttpClient(params.convexUrl)
  ;(http as any).setAdminAuth(params.deployKey)

  const ctx: RunnerCtx = {
    runQuery: (ref, args) => withNetworkRetry(() => http.query(ref as any, args)),
    runMutation: (ref, args) => http.mutation(ref as any, args),
    runAction: (ref, args) => http.action(ref as any, args),
    storage: {
      getUrl: (storageId) =>
        ctx.runQuery(params.bridge.getStorageUrl, { storageId }),
      get: async (storageId) => {
        const url = await ctx.runQuery<string | null>(
          params.bridge.getStorageUrl,
          { storageId },
        )
        if (!url) return null
        const response = await withNetworkRetry(() => fetch(url))
        if (!response.ok) return null
        return await response.blob()
      },
      store: async (blob) => {
        const uploadUrl = await ctx.runMutation<string>(
          params.bridge.generateRunnerUploadUrl,
          {},
        )
        const response = await withNetworkRetry(() =>
          fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'application/octet-stream' },
            body: blob,
          }),
        )
        if (!response.ok) {
          throw new Error(`Storage upload failed: ${response.status}`)
        }
        const { storageId } = (await response.json()) as { storageId: string }
        return storageId
      },
      delete: async (storageId) => {
        await ctx.runMutation(params.bridge.deleteStorageBlob, { storageId })
      },
    },
  }
  return ctx
}

/** Long-lived websocket client for subscriptions (queue + per-run status). */
export function createSubscriptionClient(params: {
  convexUrl: string
  deployKey: string
}): ConvexClient {
  const client = new ConvexClient(params.convexUrl)
  ;(client as any).setAdminAuth(params.deployKey)
  return client
}
