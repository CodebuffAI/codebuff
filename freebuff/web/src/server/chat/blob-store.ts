import { ConvexHttpClient } from 'convex/browser'

import { api } from '@/convex/_generated/api'

import type { ChatImageRef } from './store'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * Storage backend for chat image attachments. The chat product keeps its
 * system-of-record in Postgres; only opaque binary blobs live here, keyed by an
 * opaque `storageId`. This interface is the seam: today it's backed by Convex
 * file storage (already deployed for freebuff web), but it can be swapped for
 * S3/R2 without touching the routes, the message schema, or the UI — they only
 * ever deal with `storageId`s and resolved URLs.
 */
export interface BlobStore {
  /** Stores bytes and returns an opaque storage id. */
  upload(bytes: ArrayBuffer, mediaType: string): Promise<string>
  /**
   * Resolves storage ids to currently-valid serving URLs. Returns a map from
   * id → URL; ids whose blob no longer exists are omitted. Callers must treat a
   * missing id as "image gone" rather than an error.
   */
  getUrls(storageIds: string[]): Promise<Record<string, string>>
  /** Best-effort delete; never throws for already-deleted ids. */
  deleteMany(storageIds: string[]): Promise<void>
}

/** Convex-storage-backed BlobStore. The storage functions it calls
 *  (generateUploadUrl/getImageUrls/deleteImages) are public Convex functions,
 *  so only the deployment URL is needed — no Convex auth token. */
class ConvexBlobStore implements BlobStore {
  private readonly client: ConvexHttpClient

  constructor(deploymentUrl: string) {
    this.client = new ConvexHttpClient(deploymentUrl)
  }

  async upload(bytes: ArrayBuffer, mediaType: string): Promise<string> {
    const uploadUrl = await this.client.mutation(
      api.messages.generateUploadUrl,
      {},
    )
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': mediaType },
      body: bytes,
    })
    if (!res.ok) {
      throw new Error(`Convex upload failed: ${res.status}`)
    }
    const { storageId } = (await res.json()) as { storageId?: string }
    if (!storageId) {
      throw new Error('Convex upload response missing storageId')
    }
    return storageId
  }

  async getUrls(storageIds: string[]): Promise<Record<string, string>> {
    if (storageIds.length === 0) return {}
    const urls = await this.client.query(api.messages.getImageUrls, {
      storageIds: storageIds as Id<'_storage'>[],
    })
    const map: Record<string, string> = {}
    storageIds.forEach((id, i) => {
      const url = urls[i]
      if (url) map[id] = url
    })
    return map
  }

  async deleteMany(storageIds: string[]): Promise<void> {
    if (storageIds.length === 0) return
    await this.client.mutation(api.messages.deleteImages, {
      storageIds: storageIds as Id<'_storage'>[],
    })
  }
}

let store: BlobStore | null = null

/** The configured blob store for the chat product (Convex storage today). */
export function getBlobStore(): BlobStore {
  if (store) return store
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not set; cannot store images.')
  }
  store = new ConvexBlobStore(url)
  return store
}

/** A message image attachment with its serving URL resolved for the client. */
export interface ResolvedChatImage {
  storageId: string
  url: string
  mediaType: string
}

/**
 * Replaces each message's stored image refs (storageId + mediaType) with
 * resolved serving URLs, in a single blob-store round-trip across all messages.
 * Messages without images come back with `images: undefined`; refs whose blob
 * has been deleted are dropped.
 */
export async function hydrateMessageImages<T extends { images?: unknown }>(
  messages: T[],
): Promise<Array<Omit<T, 'images'> & { images?: ResolvedChatImage[] }>> {
  const allIds = messages.flatMap((m) =>
    Array.isArray(m.images)
      ? (m.images as ChatImageRef[]).map((img) => img.storageId)
      : [],
  )
  const urls = allIds.length > 0 ? await getBlobStore().getUrls(allIds) : {}
  return messages.map((m) => {
    const { images, ...rest } = m
    if (!Array.isArray(images)) {
      return { ...rest, images: undefined }
    }
    const resolved = (images as ChatImageRef[])
      .map((img) => ({
        storageId: img.storageId,
        mediaType: img.mediaType,
        url: urls[img.storageId],
      }))
      .filter((img): img is ResolvedChatImage => Boolean(img.url))
    return { ...rest, images: resolved.length > 0 ? resolved : undefined }
  })
}
