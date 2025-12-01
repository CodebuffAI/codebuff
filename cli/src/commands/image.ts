import { getProjectRoot } from '../project-files'
import { getSystemMessage } from '../utils/message-history'
import { SUPPORTED_IMAGE_EXTENSIONS } from '../utils/image-handler'
import { validateAndAddImage } from '../utils/add-pending-image'

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

  // Validate and add the image (handles path resolution, format check, and processing)
  const result = await validateAndAddImage(imagePath, projectRoot)
  if (!result.success) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(`❌ ${result.error}`),
    ]
    return { postUserMessage }
  }

  // Use the optional message as the prompt, or empty to just attach the image
  const transformedPrompt = message || ''

  const postUserMessage: PostUserMessageFn = (prev) => prev

  return {
    postUserMessage,
    transformedPrompt,
  }
}
