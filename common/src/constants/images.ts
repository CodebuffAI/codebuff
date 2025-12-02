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

// Size limits for image uploads
// Research shows Claude/GPT-4V support up to 20MB, but we use practical limits
// for good performance and token efficiency
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024 // 10MB - allow larger files since we can compress
export const MAX_IMAGE_BASE64_SIZE = 1 * 1024 * 1024 // 1MB max for base64 after compression
export const MAX_TOTAL_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB total for multiple images
