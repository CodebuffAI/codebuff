import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import {
  CHAT_DOC_MAX_BYTES,
  CHAT_IMAGE_ALLOWED_TYPES_SET,
  CHAT_IMAGE_MAX_BYTES,
  classifyAttachment,
  fileExtension,
} from '@/app/chat/models'
import { getChatAccessTier } from '@/server/chat/access'
import { getChatUserId } from '@/server/chat/auth'
import { getBlobStore } from '@/server/chat/blob-store'
import { CHAT_DISABLED, chatDisabledResponse } from '@/server/chat/disabled'
import {
  EmptyDocumentError,
  extractText,
  UnsupportedDocumentError,
} from '@/server/chat/extract'
import { isUserBanned } from '@/server/chat/store'
import { logger } from '@/util/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Slightly above the largest per-file limit to allow for multipart overhead;
// the real per-file limit is enforced on the parsed file below.
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
      { error: 'file_too_large', message: 'File is too large.' },
      { status: 413 },
    )
  }

  // Upload is a full-access-only feature: limited users (unsupported
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
      { error: 'forbidden', message: 'File upload is not available.' },
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

  const kind = classifyAttachment(file.name, file.type)
  if (kind === 'image') {
    return handleImageUpload(file, userId)
  }
  if (kind === 'document') {
    return handleDocumentUpload(file, userId)
  }
  return NextResponse.json(
    {
      error: 'unsupported_type',
      message:
        'Unsupported file type. Upload an image, or a text, code, CSV, JSON, Markdown, PDF, or Word file.',
    },
    { status: 400 },
  )
}

/** Stores an image's raw bytes and returns a ref + an immediate preview URL. */
async function handleImageUpload(file: File, userId: string) {
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
      { error: 'file_too_large', message: 'Image is too large (max 10 MB).' },
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
      kind: 'image',
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

/**
 * Converts a document to text (the hard part of file upload) and stores the
 * EXTRACTED text — not the original bytes — in the blob store, so the chat
 * agent can read or search it later. Returns a ref carrying the size metadata
 * the agent uses to decide inline-vs-search.
 */
async function handleDocumentUpload(file: File, userId: string) {
  if (file.size > CHAT_DOC_MAX_BYTES) {
    return NextResponse.json(
      { error: 'file_too_large', message: 'File is too large (max 5 MB).' },
      { status: 413 },
    )
  }

  // Metric fields (no filename / content — PII-lean): file kind + size, and on
  // success the extracted size + truncation. Queryable in Axiom by `metric`.
  const ext = fileExtension(file.name)
  const byteSize = file.size

  let text: string
  let truncated: boolean
  try {
    const result = await extractText({
      bytes: await file.arrayBuffer(),
      mediaType: file.type,
      fileName: file.name,
    })
    text = result.text
    truncated = result.truncated
  } catch (error) {
    const reason =
      error instanceof UnsupportedDocumentError
        ? 'unsupported'
        : error instanceof EmptyDocumentError
          ? 'empty'
          : 'error'
    logger.info(
      { metric: 'chat_doc_extracted', ext, bytes: byteSize, ok: false, reason },
      'chat document extraction failed',
    )
    if (reason !== 'error') {
      return NextResponse.json(
        { error: 'extract_failed', message: (error as Error).message },
        { status: 400 },
      )
    }
    logger.error(
      { error, userId, name: file.name, type: file.type },
      'Chat document extraction failed',
    )
    return NextResponse.json(
      {
        error: 'extract_failed',
        message: 'Could not read this file. Please try a different file.',
      },
      { status: 422 },
    )
  }

  try {
    const bytes = new TextEncoder().encode(text)
    const storageId = await getBlobStore().upload(
      // Copy into a standalone ArrayBuffer (TextEncoder may return a view over
      // a larger pooled buffer).
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      'text/plain; charset=utf-8',
    )
    logger.info(
      {
        metric: 'chat_doc_extracted',
        ext,
        bytes: byteSize,
        chars: text.length,
        truncated,
        ok: true,
      },
      'chat document extracted',
    )
    return NextResponse.json({
      kind: 'document',
      storageId,
      mediaType: file.type || 'text/plain',
      name: file.name,
      chars: text.length,
      truncated,
    })
  } catch (error) {
    logger.error({ error, userId, name: file.name }, 'Chat document upload failed')
    return NextResponse.json(
      {
        error: 'upload_failed',
        message: 'Could not upload the file. Please try again.',
      },
      { status: 500 },
    )
  }
}
