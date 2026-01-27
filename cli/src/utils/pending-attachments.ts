import { existsSync } from 'node:fs'
import path from 'node:path'

import { processImageFile, resolveFilePath, isImageFile } from './image-handler'
import {
  useChatStore,
  type PendingAttachment,
  type PendingImageAttachment,
} from '../state/chat-store'

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
          : att
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
  
  // Auto-remove error images after a delay
  setTimeout(() => {
    useChatStore.getState().removePendingImage(imagePath)
  }, AUTO_REMOVE_ERROR_DELAY_MS)
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

/**
 * Check if any pending images are still processing.
 */
export function hasProcessingImages(): boolean {
  return useChatStore.getState().pendingAttachments.some(
    (att) => att.kind === 'image' && att.status === 'processing',
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


