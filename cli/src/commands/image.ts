import { existsSync } from 'fs'
import path from 'path'

import { getProjectRoot } from '../project-files'
import { getSystemMessage } from '../utils/message-history'
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  isImageFile,
} from '../utils/image-handler'

import type { PostUserMessageFn } from '../types/contracts/send-message'

/**
 * Handle the /image command to attach an image file.
 * Usage: /image <path> [message]
 * Example: /image ./screenshot.png please analyze this
 */
export function handleImageCommand(args: string): {
  postUserMessage: PostUserMessageFn
  transformedPrompt?: string
} {
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
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(
        `❌ Unsupported image format: ${ext}\n` +
          `Supported formats: ${Array.from(SUPPORTED_IMAGE_EXTENSIONS).join(', ')}`,
      ),
    ]
    return { postUserMessage }
  }

  // Transform the command into a prompt with the image path
  // The image-handler will auto-detect paths like ./image.png or @image.png
  const transformedPrompt = message
    ? `${message} ${imagePath}`
    : `Please analyze this image: ${imagePath}`

  const postUserMessage: PostUserMessageFn = (prev) => prev

  return {
    postUserMessage,
    transformedPrompt,
  }
}
