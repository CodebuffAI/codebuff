/**
 * Server-side attachment reader.
 *
 * The desktop agent runs locally with full file tools, so an "attachment" is just
 * an absolute path the user dragged in or picked. Mirroring the CLI's behaviour
 * (cli/src/utils/pending-attachments.ts) we inline small text files and directory
 * listings straight into the prompt so the agent sees them without a tool round-trip.
 *
 * Images get two treatments: vision-friendly formats (png/jpeg/gif/webp) under a size
 * cap are read to base64 and returned as `images`, which the Codebuff harness sends as
 * message content so MiniMax M3 can actually SEE them. Everything else (and Claude
 * Code, which views images via the `Read` tool) is referenced by path in the prompt.
 *
 * Paths usually live OUTSIDE the thread's git worktree (e.g. ~/Desktop/photo.png);
 * the agent's file tools can reach absolute paths anywhere, so referencing the path is
 * always valid even when we don't inline the bytes.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname } from 'path'

import { attachmentSummary, MAX_ATTACHMENTS, type AttachmentImage, type AttachmentMeta } from '../core/attachments'

/** Inline at most this many bytes of a text file (bigger → reference by path). */
const MAX_FILE_READ_SIZE = 1024 * 1024 // 1 MB
/** Truncate inlined text to this many chars so one file can't blow the prompt. */
const MAX_CONTENT_CHARS = 100_000
/** Cap a directory listing so a huge folder doesn't flood the prompt. */
const MAX_DIR_ENTRIES = 200
/** Don't base64-inline an image larger than this; reference it by path instead.
 *  (No compression yet — see followups. Keeps the request payload sane.) */
const MAX_IMAGE_INLINE_SIZE = 5 * 1024 * 1024 // 5 MB

// Keep in sync with the renderer's chip-icon regex (Composer.tsx IMAGE_RE).
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.heic', '.heif', '.tif', '.tiff',
])

/** Formats a multimodal model reliably accepts as inline content → MIME type.
 *  Other image kinds (heic/tiff/svg/bmp/avif) are referenced by path only. */
const VISION_MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface AttachmentBlock {
  /** Prompt text to append after the user's message (empty if nothing readable). */
  promptBlock: string
  /** What was attached, for the transcript summary line. */
  manifest: AttachmentMeta[]
  /** The compact `📎 …` line shown in the user's message bubble. */
  summary: string
  /** Base64 images to send as model message content (vision harnesses only). */
  images: AttachmentImage[]
}

export interface BuildOptions {
  /** Whether the running harness sends images as inline message content (Codebuff on
   *  MiniMax M3). When true we read vision-friendly images to base64 and tell the
   *  model the image is attached; when false (Claude Code, which reads images from
   *  the path via its `Read` tool) we skip the base64 work and reference the path. */
  inlineImages?: boolean
}

/** Read a vision-friendly image under the size cap to base64, else null (caller
 *  falls back to a path reference). */
function readImageContent(path: string, ext: string, size: number): AttachmentImage | null {
  const mediaType = VISION_MEDIA_TYPES[ext]
  if (!mediaType || size > MAX_IMAGE_INLINE_SIZE) return null
  try {
    return { image: readFileSync(path).toString('base64'), mediaType }
  } catch {
    return null
  }
}

function describeDirectory(path: string): string {
  try {
    const entries = readdirSync(path, { withFileTypes: true })
    const sorted = [...entries].sort(
      (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
    )
    let listing = sorted
      .slice(0, MAX_DIR_ENTRIES)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n')
    if (entries.length > MAX_DIR_ENTRIES) {
      listing += `\n… (${entries.length - MAX_DIR_ENTRIES} more)`
    }
    return `[Directory: ${path}]\n${listing || '(empty directory)'}`
  } catch (err) {
    return `[Directory: ${path}] (could not read: ${(err as Error).message})`
  }
}

function describeFile(path: string, size: number): string {
  if (size === 0) return `[File: ${path}]\n(empty file)`
  if (size > MAX_FILE_READ_SIZE) {
    return `[File: ${path}] (${formatSize(size)} — too large to inline; read this path with your file tools.)`
  }
  let buf: Buffer
  try {
    buf = readFileSync(path)
  } catch (err) {
    return `[File: ${path}] (could not read: ${(err as Error).message})`
  }
  if (isBinary(buf)) {
    return `[File: ${path}] (${formatSize(size)} binary file — read this path with your file tools if needed.)`
  }
  let text = buf.toString('utf-8')
  if (text.length > MAX_CONTENT_CHARS) text = `${text.slice(0, MAX_CONTENT_CHARS)}\n… (truncated)`
  return `[File: ${path}]\n${text}`
}

/**
 * Read a set of attachment paths into a prompt block + a transcript manifest.
 * Unreadable / missing paths are skipped (best-effort) so one bad path doesn't sink
 * the whole message.
 */
export function buildAttachmentBlock(
  paths: readonly string[],
  opts: BuildOptions = {},
): AttachmentBlock {
  const sections: string[] = []
  const manifest: AttachmentMeta[] = []
  const images: AttachmentImage[] = []

  // Defensive cap (the composer also caps): never read more than the limit.
  for (const path of paths.slice(0, MAX_ATTACHMENTS)) {
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue // missing / unreadable — drop it
    }
    const name = basename(path)

    if (stat.isDirectory()) {
      sections.push(describeDirectory(path))
      manifest.push({ name, kind: 'directory' })
      continue
    }

    const ext = extname(path).toLowerCase()
    if (IMAGE_EXTS.has(ext)) {
      // Only inline base64 when the harness actually shows it to the model; otherwise
      // the "it's attached" claim would be false and we'd waste the read.
      const content = opts.inlineImages ? readImageContent(path, ext, stat.size) : null
      if (content) {
        images.push(content)
        sections.push(`[Image: ${path}]\n(Attached to this message as an image you can see; the file is also at this path.)`)
      } else {
        sections.push(`[Image: ${path}]\n(Read this path with your file tools to view the image.)`)
      }
      manifest.push({ name, kind: 'image' })
      continue
    }

    sections.push(describeFile(path, stat.size))
    manifest.push({ name, kind: 'file' })
  }

  const promptBlock = sections.length
    ? `The user attached the following ${sections.length === 1 ? 'item' : 'items'}. ` +
      `The paths are absolute and readable with your file tools:\n\n${sections.join('\n\n')}`
    : ''

  return { promptBlock, manifest, summary: attachmentSummary(manifest), images }
}
