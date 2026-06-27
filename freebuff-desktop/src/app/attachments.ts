/**
 * Server-side attachment reader.
 *
 * The desktop agent runs locally with full file tools, so an "attachment" is just
 * an absolute path the user dragged in or picked. Mirroring the CLI's behaviour
 * (cli/src/utils/pending-attachments.ts) we inline small text files and directory
 * listings straight into the prompt so the agent sees them without a tool round-trip,
 * and for images / large / binary files we hand it the path with a nudge to read it
 * (kept harness-neutral — Claude Code reads images via `Read`, the Codebuff agent via
 * `read_files`; both can reach absolute paths).
 *
 * Paths usually live OUTSIDE the thread's git worktree (e.g. ~/Desktop/photo.png);
 * the agent's Read/Bash can reach absolute paths anywhere, so referencing the path is
 * always valid even when we don't inline the bytes.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname } from 'path'

import { attachmentSummary, type AttachmentMeta } from '../core/attachments'

/** Inline at most this many bytes of a text file (bigger → reference by path). */
const MAX_FILE_READ_SIZE = 1024 * 1024 // 1 MB
/** Truncate inlined text to this many chars so one file can't blow the prompt. */
const MAX_CONTENT_CHARS = 100_000
/** Cap a directory listing so a huge folder doesn't flood the prompt. */
const MAX_DIR_ENTRIES = 200

// Keep in sync with the renderer's chip-icon regex (Composer.tsx IMAGE_RE).
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.heic', '.heif', '.tif', '.tiff',
])

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
export function buildAttachmentBlock(paths: readonly string[]): AttachmentBlock {
  const sections: string[] = []
  const manifest: AttachmentMeta[] = []

  for (const path of paths) {
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

    if (IMAGE_EXTS.has(extname(path).toLowerCase())) {
      sections.push(`[Image: ${path}]\n(Read this path with your file tools to view the image.)`)
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

  return { promptBlock, manifest, summary: attachmentSummary(manifest) }
}
