import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import {
  CHAT_IMAGE_ALLOWED_TYPES_SET,
  CHAT_IMAGE_MAX_BYTES,
} from '@/app/chat/models'
import { getChatAccessTier } from '@/server/chat/access'
import { getChatUserId } from '@/server/chat/auth'
import { getBlobStore } from '@/server/chat/blob-store'
import { CHAT_DISABLED, chatDisabledResponse } from '@/server/chat/disabled'
import { isUserBanned } from '@/server/chat/store'
import { logger } from '@/util/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Slightly above CHAT_IMAGE_MAX_BYTES to allow for multipart overhead; the
// real per-file limit is enforced on the parsed file below.
const MAX_BODY_BYTES = CHAT_IMAGE_MAX_BYTES + 1024 * 1024

export async function POST(request: NextRequest) {
  if (CHAT_DISABLED) {
    return chatDisabledResponse()
  }
  const userId = await getChatUserId()
  if (!userId) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Please sign in to chat.' },
      { status: 401 },
    )
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'image_too_large', message: 'Image is too large (max 10 MB).' },
      { status: 413 },
    )
  }

  // Image upload is a full-access-only feature: limited users (unsupported
  // countries, VPN/proxy) are pinned to a text-only model, so don't accept
  // their uploads either.
  const [accessTier, banned] = await Promise.all([
    getChatAccessTier(userId, request),
    isUserBanned(userId),
  ])
  if (banned) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Your account has been suspended.' },
      { status: 403 },
    )
  }
  if (accessTier !== 'full') {
    return NextResponse.json(
      { error: 'forbidden', message: 'Image upload is not available.' },
      { status: 403 },
    )
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    const value = form.get('file')
    if (value instanceof File) {
      file = value
    }
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Could not read the upload.' },
      { status: 400 },
    )
  }
  if (!file) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'No file provided.' },
      { status: 400 },
    )
  }

  const mediaType = file.type
  if (!CHAT_IMAGE_ALLOWED_TYPES_SET.has(mediaType)) {
    return NextResponse.json(
      {
        error: 'unsupported_type',
        message: 'Only JPEG, PNG, WebP, and GIF images are supported.',
      },
      { status: 400 },
    )
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: 'image_too_large', message: 'Image is too large (max 10 MB).' },
      { status: 413 },
    )
  }

  try {
    const blobStore = getBlobStore()
    const storageId = await blobStore.upload(await file.arrayBuffer(), mediaType)
    // Resolve a URL for the client's immediate preview; the message itself
    // persists only the storageId and re-resolves on load.
    const urls = await blobStore.getUrls([storageId])
    const url = urls[storageId]
    if (!url) {
      throw new Error('Could not resolve uploaded image URL')
    }
    return NextResponse.json({
      storageId,
      url,
      mediaType,
      name: file.name,
    })
  } catch (error) {
    logger.error({ error, userId }, 'Chat image upload failed')
    return NextResponse.json(
      {
        error: 'upload_failed',
        message: 'Could not upload the image. Please try again.',
      },
      { status: 500 },
    )
  }
}
