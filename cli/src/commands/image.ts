import { getProjectRoot } from '../project-files'
import { validateAndAddImage } from '../utils/pending-attachments'

/**
 * Handle the /image command to attach an image file.
 * Usage: /image <path> [message]
 * Example: /image ./screenshot.png please analyze this
 * 
 * Returns the optional message as transformedPrompt (empty string if none).
 * Errors are shown in the pending images banner with auto-remove.
 */
export async function handleImageCommand(args: string): Promise<string> {
  const [imagePath, ...rest] = args.trim().split(/\s+/)
  
  if (imagePath) {
    await validateAndAddImage(imagePath, getProjectRoot())
  }
  
  return rest.join(' ')
}
