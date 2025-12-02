import { extractImagePaths, processImageFile } from './image-handler'
import { logger } from './logger'

import type { PendingImage } from '../state/chat-store'
import type { MessageContent } from '@codebuff/sdk'

// Converts pending images + inline references into SDK-ready message content.
export type ProcessedImagePart = {
  type: 'image'
  image: string
  mediaType: string
  filename?: string
  size?: number
  width?: number
  height?: number
  path: string
}

export const processImagesForMessage = async (params: {
  content: string
  pendingImages: PendingImage[]
  projectRoot: string
  processor?: typeof processImageFile
  log?: typeof logger
}): Promise<{
  attachments: { path: string; filename: string; size?: number }[]
  messageContent: MessageContent[] | undefined
}> => {
  const {
    content,
    pendingImages,
    projectRoot,
    processor = processImageFile,
    log = logger,
  } = params

  const detectedImagePaths = extractImagePaths(content)
  const allImagePaths = [
    ...pendingImages.map((img) => img.path),
    ...detectedImagePaths,
  ]
  const uniqueImagePaths = [...new Set(allImagePaths)]

  const attachments = pendingImages.map((img) => ({
    path: img.path,
    filename: img.filename,
    size: img.size,
  }))

  const validImageParts: ProcessedImagePart[] = []
  for (const imagePath of uniqueImagePaths) {
    const result = await processor(imagePath, projectRoot)
    if (result.success && result.imagePart) {
      validImageParts.push({
        type: 'image',
        image: result.imagePart.image,
        mediaType: result.imagePart.mediaType,
        filename: result.imagePart.filename,
        size: result.imagePart.size,
        width: result.imagePart.width,
        height: result.imagePart.height,
        path: imagePath,
      })
    } else if (!result.success) {
      log.warn(
        { imagePath, error: result.error },
        'Failed to process image for SDK',
      )
    }
  }

  let messageContent: MessageContent[] | undefined
  if (validImageParts.length > 0) {
    messageContent = validImageParts.map((img) => ({
      type: 'image',
      image: img.image,
      mediaType: img.mediaType,
    }))
  }

  return {
    attachments,
    messageContent,
  }
}
