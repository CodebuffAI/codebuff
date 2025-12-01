import { existsSync } from 'fs'
import path from 'path'

import { getProjectRoot } from '../project-files'
import { useChatStore } from '../state/chat-store'
import { getSystemMessage } from '../utils/message-history'
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  isImageFile,
  getImageProcessingNote,
} from '../utils/image-handler'

import type { PostUserMessageFn } from '../types/contracts/send-message'

/**
 * Handle the /image command to attach an image file.
 * Usage: /image <path> [message]
 * Example: /image ./screenshot.png please analyze this
 */
export async function handleImageCommand(args: string): Promise<{
  postUserMessage: PostUserMessageFn
  transformedPrompt?: string
}> {
  const trimmedArgs = args.trim()

  if (!trimmedArgs) {
    // No path provided - show usage help
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(
        `📸 **Image Command Usage**\n\n` +
          `  /image <path> [message]\n\n` +
          `**Examples:**\n` +
          `  /image ./screenshot.png\n` +
          `  /image ~/Desktop/error.png please help debug this\n` +
          `  /image assets/diagram.jpg explain this architecture\n\n` +
          `**Supported formats:** ${Array.from(SUPPORTED_IMAGE_EXTENSIONS).join(', ')}\n\n` +
          `**Tip:** You can also include images directly in your message:\n` +
          `  "Please analyze ./image.png and tell me what you see"`,
      ),
    ]
    return { postUserMessage }
  }

  // Parse the path and optional message
  // The path is the first argument (up to first space or the whole string)
  const parts = trimmedArgs.match(/^(\S+)(?:\s+(.*))?$/)
  if (!parts) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage('❌ Invalid image command format. Use: /image <path> [message]'),
    ]
    return { postUserMessage }
  }

  const [, imagePath, message] = parts
  const projectRoot = getProjectRoot()

  // Resolve the path relative to project root
  let resolvedPath = imagePath
  if (!path.isAbsolute(imagePath) && !imagePath.startsWith('~')) {
    resolvedPath = path.resolve(projectRoot, imagePath)
  } else if (imagePath.startsWith('~')) {
    resolvedPath = path.resolve(
      process.env.HOME || process.env.USERPROFILE || '',
      imagePath.slice(1),
    )
  }

  // Check if file exists
  if (!existsSync(resolvedPath)) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(`❌ Image file not found: ${imagePath}`),
    ]
    return { postUserMessage }
  }

  // Check if it's a supported image format
  if (!isImageFile(imagePath)) {
    const ext = path.extname(imagePath).toLowerCase()
    const filename = path.basename(resolvedPath)
    // Add to pending images with unsupported format error
    useChatStore.getState().addPendingImage({
      path: resolvedPath,
      filename,
      note: `unsupported format ${ext}`,
    })
    const postUserMessage: PostUserMessageFn = (prev) => prev
    return { postUserMessage }
  }

  // Process and add image (handles compression and caching)
  const { addPendingImageFromFile } = await import('../utils/add-pending-image')
  await addPendingImageFromFile(resolvedPath, getProjectRoot())

  // Use the optional message as the prompt, or empty to just attach the image
  const transformedPrompt = message || ''

  const postUserMessage: PostUserMessageFn = (prev) => prev

  return {
    postUserMessage,
    transformedPrompt,
  }
}
