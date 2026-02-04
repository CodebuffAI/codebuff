/**
 * Image Thumbnail Component
 * Renders a small image preview using colored Unicode half-blocks
 * Uses OpenTUI's native fg/backgroundColor styling instead of ANSI escape sequences
 */

import React, { useEffect, useState, memo } from 'react'

import { type ImageCardImage } from './image-card'
import {
  extractThumbnailColors,
  rgbToHex,
  type ThumbnailData,
} from '../utils/image-thumbnail'

interface ImageThumbnailProps {
  image: ImageCardImage
  width: number // Width in cells
  height: number // Height in rows (each row uses half-blocks for 2 pixel rows)
  fallback?: React.ReactNode
}

/**
 * Renders an image as colored blocks using Unicode half-blocks (▀)
 * Each character cell displays 2 vertical pixels by using:
 * - Foreground color for top pixel
 * - Background color for bottom pixel
 * - ▀ (upper half block) character
 */
export const ImageThumbnail = memo(({
  image,
  width,
  height,
  fallback,
}: ImageThumbnailProps) => {
  const [thumbnailData, setThumbnailData] = useState<ThumbnailData | null>(null)

  useEffect(() => {
    // Skip loading while image is processing or has error to avoid race condition and unnecessary failed reads
    if ((image.status ?? 'ready') !== 'ready') return

    let cancelled = false

    const loadThumbnail = async () => {
      let data: ThumbnailData | null = null
      try {
        if (image.processedImage) {
          const imageBuffer = Buffer.from(image.processedImage.base64, 'base64')
          data = await extractThumbnailColors(imageBuffer, width, height)
        } else if (!image.path.startsWith('clipboard:')) {
          data = await extractThumbnailColors(image.path, width, height)
        }
      } catch {
        // Ignore errors, will show fallback
      }

      if (!cancelled) {
        setThumbnailData(data)
      }
    }

    loadThumbnail()

    return () => {
      cancelled = true
    }
  }, [image, width, height])

  if (!thumbnailData) {
    return <>{fallback}</>
  }

  // Render the thumbnail using half-blocks
  // Each row of our output combines 2 pixel rows from the image
  const rows: React.ReactNode[] = []
  
  for (let rowIndex = 0; rowIndex < thumbnailData.height; rowIndex += 2) {
    const topRow = thumbnailData.pixels[rowIndex]
    const bottomRow = thumbnailData.pixels[rowIndex + 1] || topRow // Use top row if no bottom
    
    const cells: React.ReactNode[] = []
    
    for (let col = 0; col < thumbnailData.width; col++) {
      const topPixel = topRow[col]
      const bottomPixel = bottomRow[col]
      
      const fgColor = rgbToHex(topPixel.r, topPixel.g, topPixel.b)
      const bgColor = rgbToHex(bottomPixel.r, bottomPixel.g, bottomPixel.b)
      
      cells.push(
        <box
          key={col}
          style={{
            backgroundColor: bgColor,
          }}
        >
          <text style={{ fg: fgColor }}>▀</text>
        </box>
      )
    }
    
    rows.push(
      <box key={rowIndex} style={{ flexDirection: 'row' }}>
        {cells}
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column' }}>
      {rows}
    </box>
  )
})
