import { getProjectRoot } from '../project-files'
import { validateAndAddImage } from '../utils/add-pending-image'
import { getSystemMessage } from '../utils/message-history'

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

  // Validate and add the image (handles path resolution, format check, and processing)
  // Errors are shown in the pending images banner with auto-remove
  await validateAndAddImage(imagePath, projectRoot)

  // Use the optional message as the prompt, or empty to just attach the image
  const transformedPrompt = message || ''

  const postUserMessage: PostUserMessageFn = (prev) => prev

  return {
    postUserMessage,
    transformedPrompt,
  }
}
