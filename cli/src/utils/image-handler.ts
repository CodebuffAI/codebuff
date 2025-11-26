import { readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

import { logger } from './logger'

export interface ImageUploadResult {
  success: boolean
  imagePart?: {
    type: 'image'
    image: string // base64
    mediaType: string
    filename?: string
    size?: number
  }
  error?: string
}

// Supported image formats
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
])

// Size limits - balanced to prevent message truncation while allowing reasonable images
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB - allow larger files for compression
const MAX_TOTAL_SIZE = 5 * 1024 * 1024 // 5MB total
const MAX_BASE64_SIZE = 150 * 1024 // 150KB max for base64 (backend limit ~760KB, so safe margin)

function normalizeUserProvidedPath(filePath: string): string {
  let normalized = filePath

  normalized = normalized.replace(
    /\\u\{([0-9a-fA-F]+)\}/g,
    (match, codePoint) => {
      const value = Number.parseInt(codePoint, 16)
      if (Number.isNaN(value)) {
        return match
      }
      try {
        return String.fromCodePoint(value)
      } catch {
        return match
      }
    },
  )

  normalized = normalized.replace(
    /\\u([0-9a-fA-F]{4})/g,
    (match, codePoint) => {
      const value = Number.parseInt(codePoint, 16)
      if (Number.isNaN(value)) {
        return match
      }
      try {
        return String.fromCodePoint(value)
      } catch {
        return match
      }
    },
  )

  normalized = normalized.replace(
    /\\x([0-9a-fA-F]{2})/g,
    (match, codePoint) => {
      const value = Number.parseInt(codePoint, 16)
      if (Number.isNaN(value)) {
        return match
      }
      return String.fromCharCode(value)
    },
  )

  normalized = normalized.replace(/\\([ \t"'(){}\[\]])/g, (match, char) => {
    if (char === '\\') {
      return '\\'
    }
    return char
  })

  return normalized
}

/**
 * Detects MIME type from file extension
 */
function getMimeTypeFromExtension(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.tiff':
    case '.tif':
      return 'image/tiff'
    default:
      return null
  }
}

/**
 * Validates if a file path is a supported image
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext)
}

/**
 * Resolves a file path, handling ~, relative paths, etc.
 */
export function resolveFilePath(filePath: string, cwd: string): string {
  const normalized = normalizeUserProvidedPath(filePath)
  if (normalized.startsWith('~')) {
    return path.join(homedir(), normalized.slice(1))
  }
  if (path.isAbsolute(normalized)) {
    return normalized
  }
  return path.resolve(cwd, normalized)
}

/**
 * Processes an image file and converts it to base64 for upload
 */
export async function processImageFile(
  filePath: string,
  cwd: string,
): Promise<ImageUploadResult> {
  try {
    const resolvedPath = resolveFilePath(filePath, cwd)

    // Check if file exists and get stats
    let stats
    try {
      stats = statSync(resolvedPath)
    } catch (error) {
      logger.debug(
        {
          resolvedPath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Image handler: File not found or stat failed',
      )
      return {
        success: false,
        error: `File not found: ${filePath}`,
      }
    }

    // Check if it's a file (not directory)
    if (!stats.isFile()) {
      return {
        success: false,
        error: `Path is not a file: ${filePath}`,
      }
    }

    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
      const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)
      return {
        success: false,
        error: `File too large: ${sizeMB}MB (max ${maxMB}MB): ${filePath}`,
      }
    }

    // Check if it's a supported image format
    if (!isImageFile(resolvedPath)) {
      return {
        success: false,
        error: `Unsupported image format: ${filePath}. Supported: ${Array.from(SUPPORTED_IMAGE_EXTENSIONS).join(', ')}`,
      }
    }

    // Get MIME type
    const mediaType = getMimeTypeFromExtension(resolvedPath)
    if (!mediaType) {
      return {
        success: false,
        error: `Could not determine image type for: ${filePath}`,
      }
    }

    // Read file
    let fileBuffer
    try {
      fileBuffer = readFileSync(resolvedPath)
    } catch (error) {
      logger.debug(
        {
          resolvedPath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Image handler: Failed to read file buffer',
      )
      return {
        success: false,
        error: `Could not read file: ${filePath} - ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    // Convert to base64
    const base64Data = fileBuffer.toString('base64')
    const base64Size = base64Data.length

    // Check if base64 is too large
    if (base64Size > MAX_BASE64_SIZE) {
      const sizeKB = (base64Size / 1024).toFixed(1)
      const maxKB = (MAX_BASE64_SIZE / 1024).toFixed(1)
      return {
        success: false,
        error: `Image base64 too large: ${sizeKB}KB (max ${maxKB}KB). Please use a smaller image file.`,
      }
    }

    logger.debug(
      {
        resolvedPath,
        finalSize: fileBuffer.length,
        base64Length: base64Size,
      },
      'Image handler: Final base64 conversion complete',
    )

    return {
      success: true,
      imagePart: {
        type: 'image' as const,
        image: base64Data,
        mediaType,
        filename: path.basename(resolvedPath),
        size: fileBuffer.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Error processing image: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Validates total size of multiple images
 */
export function validateTotalImageSize(imageParts: Array<{ size?: number }>): {
  valid: boolean
  error?: string
} {
  const totalSize = imageParts.reduce((sum, part) => sum + (part.size || 0), 0)

  if (totalSize > MAX_TOTAL_SIZE) {
    const totalMB = (totalSize / (1024 * 1024)).toFixed(1)
    const maxMB = (MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `Total image size too large: ${totalMB}MB (max ${maxMB}MB)`,
    }
  }

  return { valid: true }
}

/**
 * Extracts image file paths from user input using @path syntax and auto-detection
 */
export function extractImagePaths(input: string): string[] {
  const paths: string[] = []

  // Skip paths inside code blocks
  const codeBlockRegex = /```[\s\S]*?```|`[^`]*`/g
  const cleanInput = input.replace(codeBlockRegex, ' ')

  // 1. Extract @path syntax (existing behavior)
  const atPathRegex = /@([^\s]+)/g
  let match
  while ((match = atPathRegex.exec(cleanInput)) !== null) {
    const path = match[1]
    if (isImageFile(path) && !paths.includes(path)) {
      paths.push(path)
    }
  }

  // 2. Extract strong path signals (auto-detection)
  const imageExts = 'jpg|jpeg|png|webp|gif|bmp|tiff|tif'

  // Combined regex for all path types
  const pathRegexes = [
    // Absolute paths: /path/to/file, ~/path, C:\path (Windows)
    new RegExp(
      `(?:^|\\s)((?:[~/]|[A-Za-z]:\\\\)[^\\s"']*\\.(?:${imageExts}))(?=\\s|$|[.,!?;)\\]}>])`,
      'gi',
    ),
    // Relative paths with separators: ./path/file, ../path/file
    new RegExp(
      `(?:^|\\s)(\\.\\.?[\\/\\\\][^\\s"']*\\.(?:${imageExts}))(?=\\s|$|[.,!?;)\\]}>])`,
      'gi',
    ),
    // Bare relative paths with separators (like assets/image.png)
    // Exclude paths starting with @ to avoid conflicts with @path syntax
    new RegExp(
      `(?:^|\\s)((?![^\\s]*:\\/\\/|@)[^\\s"':]*[\\/\\\\][^\\s"']*\\.(?:${imageExts}))(?=\\s|$|[.,!?;)\\]}>])`,
      'gi',
    ),
    // Quoted paths (single or double quotes)
    new RegExp(`["']([^"']*[\\/\\\\][^"']*\\.(?:${imageExts}))["']`, 'gi'),
  ]

  // Extract paths using all regex patterns
  for (const regex of pathRegexes) {
    while ((match = regex.exec(cleanInput)) !== null) {
      const path = match[1].replace(/[.,!?;)\]}>">]+$/, '') // Remove trailing punctuation
      if (isImageFile(path) && !paths.includes(path)) {
        paths.push(path)
      }
    }
  }

  return paths
}
