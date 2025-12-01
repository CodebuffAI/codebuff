import { useChatStore, type PendingImage } from '../state/chat-store'
import { processImageFile, resolveFilePath, isImageFile } from './image-handler'
import path from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Process an image file and add it to the pending images state.
 * This handles compression/resizing and caches the result so we don't
 * need to reprocess at send time.
 */
export async function addPendingImageFromFile(
  imagePath: string,
  cwd: string,
): Promise<void> {
  const filename = path.basename(imagePath)
  
  // Add to pending state immediately with processing note so user sees loading state
  const pendingImage: PendingImage = {
    path: imagePath,
    filename,
    note: 'processing…',
  }
  useChatStore.getState().addPendingImage(pendingImage)

  // Process the image in background
  const result = await processImageFile(imagePath, cwd)

  // Update the pending image with processed data
  const store = useChatStore.getState()
  const pendingImages = store.pendingImages
  const updatedImages = pendingImages.map((img) => {
    if (img.path !== imagePath) return img

    if (result.success && result.imagePart) {
      return {
        ...img,
        size: result.imagePart.size,
        width: result.imagePart.width,
        height: result.imagePart.height,
        note: result.wasCompressed ? 'compressed' : undefined,
        processedImage: {
          base64: result.imagePart.image,
          mediaType: result.imagePart.mediaType,
        },
      }
    } else {
      return {
        ...img,
        note: result.error || 'failed',
      }
    }
  })

  useChatStore.setState({ pendingImages: updatedImages })
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
  
  const pendingImage: PendingImage = {
    path: tempPath || `clipboard:${filename}`,
    filename,
    size,
    processedImage: {
      base64: base64Data,
      mediaType,
    },
  }
  
  useChatStore.getState().addPendingImage(pendingImage)
}

const AUTO_REMOVE_ERROR_DELAY_MS = 3000

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
    note,
    isError: true,
  })
  
  // Auto-remove error images after a delay
  setTimeout(() => {
    useChatStore.getState().removePendingImage(imagePath)
  }, AUTO_REMOVE_ERROR_DELAY_MS)
}

/**
 * Validate and add an image from a file path.
 * Returns { success: true } if the image was added (for processing or with an error),
 * or { success: false, error } if the file doesn't exist.
 */
export async function validateAndAddImage(
  imagePath: string,
  cwd: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const resolvedPath = resolveFilePath(imagePath, cwd)
  
  // Check if file exists
  if (!existsSync(resolvedPath)) {
    addPendingImageWithError(imagePath, '❌ file not found')
    return { success: true }
  }
  
  // Check if it's a supported format
  if (!isImageFile(resolvedPath)) {
    const ext = path.extname(imagePath).toLowerCase()
    addPendingImageWithError(resolvedPath, `❌ unsupported format ${ext}`)
    return { success: true }
  }
  
  // Process and add the image
  await addPendingImageFromFile(resolvedPath, cwd)
  return { success: true }
}

/**
 * Capture and clear pending images so they can be passed to the queue without
 * duplicating state handling logic in multiple callers.
 */
export function capturePendingImages(): PendingImage[] {
  const pendingImages = [...useChatStore.getState().pendingImages]
  if (pendingImages.length > 0) {
    useChatStore.getState().clearPendingImages()
  }
  return pendingImages
}
