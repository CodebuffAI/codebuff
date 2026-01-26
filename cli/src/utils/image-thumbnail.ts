/**
 * Image thumbnail utilities for extracting pixel colors
 * Uses Jimp to decode images and sample colors for display
 */

import { Jimp, ResizeStrategy } from 'jimp'

import { logger } from './logger'

export interface ThumbnailPixel {
  r: number
  g: number
  b: number
}

export interface ThumbnailData {
  width: number
  height: number
  pixels: ThumbnailPixel[][] // [row][col]
}

/**
 * Extract a thumbnail grid of colors from an image file
 * @param imagePath - Path to the image file
 * @param targetWidth - Target width in cells
 * @param targetHeight - Target height in cells (will be doubled with half-blocks)
 * @returns Promise resolving to thumbnail data with pixel colors
 */
export async function extractThumbnailColors(
  source: string | Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<ThumbnailData | null> {
  try {
    const image = await Jimp.read(source)

    // Resize to target dimensions (height * 2 because we use half-blocks)
    // Use bilinear interpolation for smoother downscaling (sharper than nearest-neighbor)
    const resizedHeight = targetHeight * 2
    image.resize({ w: targetWidth, h: resizedHeight, mode: ResizeStrategy.BILINEAR })

    const width = image.width
    const height = image.height

    const pixels: ThumbnailPixel[][] = []

    for (let y = 0; y < height; y++) {
      const row: ThumbnailPixel[] = []
      for (let x = 0; x < width; x++) {
        const color = image.getPixelColor(x, y)
        // Jimp stores colors as 32-bit integers: RRGGBBAA
        const r = (color >> 24) & 0xff
        const g = (color >> 16) & 0xff
        const b = (color >> 8) & 0xff
        row.push({ r, g, b })
      }
      pixels.push(row)
    }

    return { width, height, pixels }
  } catch (error) {
    logger.warn(
      {
        source: typeof source === 'string' ? source : `Buffer(len=${source.length})`,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to extract thumbnail colors from image',
    )
    return null
  }
}

/**
 * Convert RGB to hex color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
