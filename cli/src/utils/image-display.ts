/**
 * Image display utilities for calculating terminal display dimensions.
 * Uses actual image dimensions to preserve aspect ratio when rendering.
 */

// Terminal cells are approximately 2:1 aspect ratio (height:width in pixels)
const CELL_ASPECT_RATIO = 2

// Approximate pixels per terminal cell for scaling
const PIXELS_PER_CELL = 15

// Maximum display width in cells to prevent images from being too large
const MAX_DISPLAY_WIDTH = 60

export interface DisplaySizeInput {
  /** Original image width in pixels */
  width?: number
  /** Original image height in pixels */
  height?: number
  /** Available terminal width in cells */
  availableWidth: number
}

export interface DisplaySize {
  /** Display width in terminal cells */
  width: number
  /** Display height in terminal cells */
  height: number
}

/**
 * Calculate display dimensions for an image in terminal cells.
 * 
 * Uses actual image dimensions to preserve aspect ratio. Falls back to
 * percentage-based sizing when dimensions are not available.
 * 
 * @param input - Image dimensions and available space
 * @returns Display dimensions in terminal cells
 */
export function calculateDisplaySize(input: DisplaySizeInput): DisplaySize {
  const { width, height, availableWidth } = input
  
  // Calculate max width with padding
  const maxWidth = Math.max(1, Math.min(availableWidth - 4, MAX_DISPLAY_WIDTH))
  
  // Fallback when dimensions are unknown or invalid
  if (!width || !height || width <= 0 || height <= 0) {
    const fallbackWidth = Math.max(1, Math.floor(maxWidth * 0.5))
    const fallbackHeight = Math.max(1, Math.floor(fallbackWidth / CELL_ASPECT_RATIO))
    return { width: fallbackWidth, height: fallbackHeight }
  }
  
  const aspectRatio = width / height
  
  // Calculate natural cell width based on image pixel dimensions
  // This prevents tiny images from being blown up too large
  const naturalCellWidth = Math.ceil(width / PIXELS_PER_CELL)
  
  // Use the smaller of natural width and max available width
  const displayWidth = Math.max(1, Math.min(naturalCellWidth, maxWidth))
  
  // Calculate height preserving aspect ratio, accounting for cell aspect ratio
  // Since cells are 2:1, we divide by CELL_ASPECT_RATIO to get proper visual proportions
  const displayHeight = Math.max(1, Math.floor(displayWidth / aspectRatio / CELL_ASPECT_RATIO))
  
  return { width: displayWidth, height: displayHeight }
}
