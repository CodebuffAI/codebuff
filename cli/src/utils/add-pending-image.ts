import { useChatStore, type PendingImage } from '../state/chat-store'
import { processImageFile } from './image-handler'
import path from 'node:path'

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
      const sizeKB = result.imagePart.size
        ? Math.round(result.imagePart.size / 1024)
        : undefined
      return {
        ...img,
        size: result.imagePart.size,
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
