import { existsSync, promises as fs, statSync } from 'node:fs'
import path from 'node:path'

import { resolveProjectPath } from '@codebuff/common/util/project-path-containment'
import { isMandatorySensitiveReadPath } from '@codebuff/common/util/sensitive-paths'

import { processImageFile, resolveFilePath, isImageFile } from './image-handler'
import { useChatStore } from '../state/chat-store'
import type { FileAttachment } from '../types/chat'
import type { PendingAttachment, PendingFileAttachment } from '../types/store'

/**
 * Exit image input mode if currently active.
 * Called after successfully adding an image via paste or path.
 */
function exitImageModeIfActive(): void {
  if (useChatStore.getState().inputMode === 'image') {
    useChatStore.getState().setInputMode('default')
  }
}

/**
 * Process an image file and add it to the pending images state.
 * This handles compression/resizing and caches the result so we don't
 * need to reprocess at send time.
 *
 * @param replacePlaceholder - If provided, replaces an existing placeholder entry instead of adding new
 */
export async function addPendingImageFromFile(
  imagePath: string,
  cwd: string,
  replacePlaceholder?: string,
): Promise<void> {
  const filename = path.basename(imagePath)

  if (replacePlaceholder) {
    // Replace existing placeholder with actual image info (still processing)
    useChatStore.setState((state) => ({
      pendingAttachments: state.pendingAttachments.map((att) =>
        att.kind === 'image' && att.path === replacePlaceholder
          ? { ...att, path: imagePath, filename }
          : att,
      ),
    }))
  } else {
    // Add to pending state immediately with processing status so user sees loading state
    useChatStore.getState().addPendingImage({
      path: imagePath,
      filename,
      status: 'processing',
    })
  }

  // Process the image in background
  const result = await processImageFile(imagePath, cwd)

  // Update the pending image with processed data
  useChatStore.setState((state) => ({
    pendingAttachments: state.pendingAttachments.map((att) => {
      if (att.kind !== 'image' || att.path !== imagePath) return att

      if (result.success && result.imagePart) {
        return {
          ...att,
          status: 'ready' as const,
          size: result.imagePart.size,
          width: result.imagePart.width,
          height: result.imagePart.height,
          note: result.wasCompressed ? 'compressed' : undefined,
          processedImage: {
            base64: result.imagePart.image,
            mediaType: result.imagePart.mediaType,
          },
        }
      }

      return {
        ...att,
        status: 'error' as const,
        note: result.error || 'failed',
      }
    }),
  }))

  // Exit image mode after successfully processing an image
  if (result.success) {
    exitImageModeIfActive()
  }
}

/**
 * Process an image from base64 data and add it to the pending images state.
 */
export async function addPendingImageFromBase64(
  base64Data: string,
  mediaType: string,
  filename: string,
  tempPath?: string,
): Promise<void> {
  // For base64 images (like clipboard), we already have the data
  // Check size and add directly
  const size = Math.round((base64Data.length * 3) / 4) // Approximate decoded size

  useChatStore.getState().addPendingImage({
    path: tempPath || `clipboard:${filename}`,
    filename,
    status: 'ready',
    size,
    processedImage: {
      base64: base64Data,
      mediaType,
    },
  })
}

const AUTO_REMOVE_ERROR_DELAY_MS = 3000

// Counter for generating unique placeholder IDs
let clipboardPlaceholderCounter = 0

// Map to store cleanup timers for error images, keyed by image path
// This allows clearing the timer if the image is removed before the delay expires
const errorImageTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Add a placeholder for a clipboard image immediately and return its path.
 * Use with addPendingImageFromFile's replacePlaceholder parameter.
 */
export function addClipboardPlaceholder(): string {
  const placeholderPath = `clipboard:pending-${++clipboardPlaceholderCounter}`
  useChatStore.getState().addPendingImage({
    path: placeholderPath,
    filename: 'clipboard image',
    status: 'processing',
  })
  return placeholderPath
}

/**
 * Add a pending image with an error note (e.g., unsupported format, not found).
 * Used when we want to show the image in the banner with an error state.
 * Error images are automatically removed after a short delay.
 *
 * Error images are automatically removed after AUTO_REMOVE_ERROR_DELAY_MS.
 */
export function addPendingImageWithError(
  imagePath: string,
  note: string,
): void {
  const filename = path.basename(imagePath)
  useChatStore.getState().addPendingImage({
    path: imagePath,
    filename,
    status: 'error',
    note,
  })

  // Clear any existing timer for this path (shouldn't happen, but be safe)
  const existingTimer = errorImageTimers.get(imagePath)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  // Auto-remove error images after a delay
  const timer = setTimeout(() => {
    errorImageTimers.delete(imagePath)
    useChatStore.getState().removePendingImage(imagePath)
  }, AUTO_REMOVE_ERROR_DELAY_MS)

  errorImageTimers.set(imagePath, timer)
}

/**
 * Clear the auto-remove timer for an error image.
 * Call this when manually removing an image to prevent memory leaks.
 */
export function clearErrorImageTimer(imagePath: string): void {
  const timer = errorImageTimers.get(imagePath)
  if (timer) {
    clearTimeout(timer)
    errorImageTimers.delete(imagePath)
  }
}

/**
 * Validate and add an image from a file path.
 * Returns { success: true } if the image was added for processing,
 * or { success: false, error } if the file doesn't exist or isn't supported.
 */
export async function validateAndAddImage(
  imagePath: string,
  cwd: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const resolvedPath = resolveFilePath(imagePath, cwd)

  // Check if file exists
  if (!existsSync(resolvedPath)) {
    const error = 'file not found'
    addPendingImageWithError(resolvedPath, `❌ ${error}`)
    return { success: false, error }
  }

  // Check if it's a supported format
  if (!isImageFile(resolvedPath)) {
    const ext = path.extname(imagePath).toLowerCase()
    const error = ext ? `unsupported format ${ext}` : 'unsupported format'
    addPendingImageWithError(resolvedPath, `❌ ${error}`)
    return { success: false, error }
  }

  // Process and add the image (addPendingImageFromFile handles exiting image mode on success)
  await addPendingImageFromFile(resolvedPath, cwd)
  return { success: true }
}

// ---------------------------------------------------------------------------
// File / folder attachments
// ---------------------------------------------------------------------------

const MAX_FILE_READ_SIZE = 1024 * 1024 // 1 MB – don't read files larger than this
const MAX_CONTENT_CHARS = 100 * 1024 // 100 KB of text content
const MAX_DIR_ENTRIES = 100

export type FileAttachmentCompleteness =
  | 'full'
  | 'truncated'
  | 'metadata-only'
  | 'shallow-directory'

export type FileAttachmentProvenance = 'attachment' | '@file selection'

type FileAttachmentContextMetadata = {
  completeness?: FileAttachmentCompleteness
  provenance?: FileAttachmentProvenance
  bytesRead?: number
  totalBytes?: number
  entriesIncluded?: number
  totalEntries?: number
}

export function getFileAttachmentContextMetadata(
  attachment: PendingFileAttachment | FileAttachment,
): Required<
  Pick<FileAttachmentContextMetadata, 'completeness' | 'provenance'>
> &
  Omit<FileAttachmentContextMetadata, 'completeness' | 'provenance'> {
  const metadata = attachment as typeof attachment &
    FileAttachmentContextMetadata
  const note = attachment.note?.toLowerCase() ?? ''
  const inferredCompleteness: FileAttachmentCompleteness = note.includes(
    'metadata only',
  )
    ? 'metadata-only'
    : note.includes('truncated')
      ? 'truncated'
      : note.includes('shallow')
        ? 'shallow-directory'
        : attachment.isDirectory
          ? 'shallow-directory'
          : 'full'
  return {
    completeness: metadata.completeness ?? inferredCompleteness,
    provenance:
      metadata.provenance ??
      (note.startsWith('@file') ? '@file selection' : 'attachment'),
    bytesRead: metadata.bytesRead,
    totalBytes: metadata.totalBytes,
    entriesIncluded: metadata.entriesIncluded,
    totalEntries: metadata.totalEntries,
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8192)
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

/**
 * Add a file or folder as a pending attachment.
 * Reads the content in the background and updates the store.
 */
export function addPendingFileFromPath(
  filePath: string,
  isDirectory: boolean,
  options: {
    displayPath?: string
    provenance?: FileAttachmentProvenance
  } = {},
): void {
  const displayPath = options.displayPath ?? filePath
  const provenance = options.provenance ?? 'attachment'
  const alreadyPending = useChatStore
    .getState()
    .pendingAttachments.some(
      (attachment) =>
        attachment.kind === 'file' && attachment.path === displayPath,
    )
  if (alreadyPending) return

  if (
    isMandatorySensitiveReadPath(displayPath) ||
    isMandatorySensitiveReadPath(filePath)
  ) {
    const blockedAttachment: Omit<PendingFileAttachment, 'kind'> &
      FileAttachmentContextMetadata = {
      id: crypto.randomUUID(),
      path: displayPath,
      filename: path.basename(displayPath) || displayPath,
      isDirectory,
      content: '',
      status: 'error',
      note: 'Blocked by mandatory sensitive-file policy',
      completeness: isDirectory ? 'shallow-directory' : 'metadata-only',
      provenance,
    }
    useChatStore.getState().addPendingFileAttachment(blockedAttachment)
    return
  }

  const id = crypto.randomUUID()
  const filename = path.basename(displayPath) || displayPath
  const initialAttachment: Omit<PendingFileAttachment, 'kind'> &
    FileAttachmentContextMetadata = {
    id,
    path: displayPath,
    filename,
    isDirectory,
    content: '',
    status: 'processing',
    completeness: isDirectory ? 'shallow-directory' : 'full',
    provenance,
  }

  useChatStore.getState().addPendingFileAttachment(initialAttachment)

  // Use promise-based filesystem APIs so large directories and files do not
  // block the OpenTUI renderer thread.
  setTimeout(async () => {
    try {
      let content: string
      let note: string
      let contextMetadata: FileAttachmentContextMetadata

      if (isDirectory) {
        const entries = await fs.readdir(filePath, { withFileTypes: true })
        const count = entries.length
        const included = Math.min(count, MAX_DIR_ENTRIES)
        note = `shallow · ${included}/${count} item${count !== 1 ? 's' : ''}`
        contextMetadata = {
          completeness: 'shallow-directory',
          provenance,
          entriesIncluded: included,
          totalEntries: count,
        }

        if (count === 0) {
          content = '(empty directory)'
        } else {
          // Sort: directories first, then files, alphabetically within each group
          const sorted = [...entries].sort((a, b) => {
            const aIsDir = a.isDirectory()
            const bIsDir = b.isDirectory()
            if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          const listing = sorted
            .slice(0, MAX_DIR_ENTRIES)
            .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
            .join('\n')
          content = listing
          if (count > MAX_DIR_ENTRIES) {
            content += `\n… and ${count - MAX_DIR_ENTRIES} more`
          }
        }
      } else {
        const stats = await fs.stat(filePath)

        if (stats.size === 0) {
          content = '(empty file)'
          note = 'full · 0 B'
          contextMetadata = {
            completeness: 'full',
            provenance,
            bytesRead: 0,
            totalBytes: 0,
          }
        } else if (stats.size > MAX_FILE_READ_SIZE) {
          content = `(file too large to preview: ${formatFileSize(stats.size)})`
          note = `metadata only · ${formatFileSize(stats.size)}`
          contextMetadata = {
            completeness: 'metadata-only',
            provenance,
            bytesRead: 0,
            totalBytes: stats.size,
          }
        } else {
          const buffer = await fs.readFile(filePath)
          if (isBinaryBuffer(buffer)) {
            content = '(binary file)'
            note = `metadata only · ${formatFileSize(stats.size)} · binary`
            contextMetadata = {
              completeness: 'metadata-only',
              provenance,
              bytesRead: 0,
              totalBytes: stats.size,
            }
          } else {
            const text = buffer.toString('utf-8')
            if (text.length > MAX_CONTENT_CHARS) {
              content = text.slice(0, MAX_CONTENT_CHARS) + '\n… (truncated)'
              note = `truncated · first ${formatFileSize(MAX_CONTENT_CHARS)} of ${formatFileSize(stats.size)}`
              contextMetadata = {
                completeness: 'truncated',
                provenance,
                bytesRead: Buffer.byteLength(text.slice(0, MAX_CONTENT_CHARS)),
                totalBytes: stats.size,
              }
            } else {
              content = text
              note = `full · ${formatFileSize(stats.size)}`
              contextMetadata = {
                completeness: 'full',
                provenance,
                bytesRead: stats.size,
                totalBytes: stats.size,
              }
            }
          }
        }
      }

      useChatStore.setState((state) => ({
        pendingAttachments: state.pendingAttachments.map((att) => {
          if (att.kind !== 'file' || att.id !== id) return att
          const displayNote =
            provenance === '@file selection' ? `@file · ${note}` : note
          return {
            ...att,
            ...contextMetadata,
            content,
            status: 'ready' as const,
            note: displayNote,
          }
        }),
      }))
    } catch {
      useChatStore.setState((state) => ({
        pendingAttachments: state.pendingAttachments.map((att) => {
          if (att.kind !== 'file' || att.id !== id) return att
          return { ...att, status: 'error' as const, note: 'Failed to read' }
        }),
      }))
    }
  }, 0)
}

/** Resolve a file-menu selection inside the project and attach its current
 * contents with explicit provenance. This turns `@file` selection into a
 * guaranteed context operation instead of relying on the model to notice text. */
export function addPendingFileMention(
  projectRelativePath: string,
  isDirectory: boolean,
  projectRoot: string,
): void {
  const resolved = resolveProjectPath(projectRoot, projectRelativePath)
  if (!resolved) {
    const id = crypto.randomUUID()
    const failedAttachment: Omit<PendingFileAttachment, 'kind'> &
      FileAttachmentContextMetadata = {
      id,
      path: projectRelativePath,
      filename: path.basename(projectRelativePath) || projectRelativePath,
      isDirectory,
      content: '',
      status: 'error',
      note: 'Failed to resolve inside project',
      completeness: isDirectory ? 'shallow-directory' : 'metadata-only',
      provenance: '@file selection',
    }
    useChatStore.getState().addPendingFileAttachment(failedAttachment)
    return
  }

  addPendingFileFromPath(resolved.realFullPath, isDirectory, {
    displayPath: resolved.relativePath,
    provenance: '@file selection',
  })
}

/**
 * Check if any pending images are still processing.
 */
export function hasProcessingImages(): boolean {
  return useChatStore
    .getState()
    .pendingAttachments.some(
      (att) => att.kind === 'image' && att.status === 'processing',
    )
}

/**
 * Check if any pending file attachments are still processing.
 */
export function hasProcessingFiles(): boolean {
  return useChatStore
    .getState()
    .pendingAttachments.some(
      (att) => att.kind === 'file' && att.status === 'processing',
    )
}

/**
 * Capture and clear all pending attachments so they can be passed to the queue
 * without duplicating state handling logic in multiple callers.
 */
export function capturePendingAttachments(): PendingAttachment[] {
  const pendingAttachments = [...useChatStore.getState().pendingAttachments]
  if (pendingAttachments.length > 0) {
    useChatStore.getState().clearPendingAttachments()
  }
  return pendingAttachments
}
