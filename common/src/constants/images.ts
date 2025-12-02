/**
 * Image-related constants shared across the codebase
 */

// Supported image formats for multimodal messages
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
])

/**
 * Check if a file extension is a supported image format
 */
export function isSupportedImageExtension(ext: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext.toLowerCase())
}

/**
 * Image extensions as a regex alternation pattern (without dots)
 * e.g., "jpg|jpeg|png|webp|gif|bmp|tiff|tif"
 */
export const IMAGE_EXTENSIONS_PATTERN = Array.from(SUPPORTED_IMAGE_EXTENSIONS)
  .map((ext) => ext.slice(1)) // Remove leading dot
  .join('|')

/**
 * Extension to MIME type mapping for supported image formats
 */
export const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
}

/**
 * Get MIME type for an image extension
 */
export function getImageMimeType(ext: string): string | null {
  return IMAGE_EXTENSION_TO_MIME[ext.toLowerCase()] ?? null
}

// Size limits for image uploads
// Research shows Claude/GPT-4V support up to 20MB, but we use practical limits
// for good performance and token efficiency
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024 // 10MB - allow larger files since we can compress
export const MAX_IMAGE_BASE64_SIZE = 1 * 1024 * 1024 // 1MB max for base64 after compression
export const MAX_TOTAL_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB total for multiple images
