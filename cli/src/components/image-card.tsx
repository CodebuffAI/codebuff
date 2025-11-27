import React, { useEffect, useState } from 'react'
import fs from 'fs'

import { Button } from './button'
import { ImageThumbnail } from './image-thumbnail'

import { useTheme } from '../hooks/use-theme'
import {
  supportsInlineImages,
  renderInlineImage,
} from '../utils/terminal-images'

// Image card display constants
const MAX_FILENAME_LENGTH = 18
const IMAGE_CARD_WIDTH = 22
const THUMBNAIL_WIDTH = 18
const THUMBNAIL_HEIGHT = 3
const INLINE_IMAGE_WIDTH = 4
const INLINE_IMAGE_HEIGHT = 3

const BORDER_CHARS = {
  horizontal: '─',
  vertical: '│',
  top: '─',
  bottom: '─',
  left: '│',
  right: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  topT: '┬',
  bottomT: '┴',
  leftT: '├',
  rightT: '┤',
  cross: '┼',
}

const truncateFilename = (filename: string): string => {
  if (filename.length <= MAX_FILENAME_LENGTH) {
    return filename
  }
  const ext = filename.split('.').pop() || ''
  const nameWithoutExt = filename.slice(0, filename.length - ext.length - 1)
  const truncatedName = nameWithoutExt.slice(
    0,
    MAX_FILENAME_LENGTH - ext.length - 4,
  )
  return `${truncatedName}…${ext ? '.' + ext : ''}`
}

export interface ImageCardImage {
  path: string
  filename: string
}

interface ImageCardProps {
  image: ImageCardImage
  onRemove?: () => void
  showRemoveButton?: boolean
}

export const ImageCard = ({
  image,
  onRemove,
  showRemoveButton = true,
}: ImageCardProps) => {
  const theme = useTheme()
  const [isCloseHovered, setIsCloseHovered] = useState(false)
  const [thumbnailSequence, setThumbnailSequence] = useState<string | null>(null)
  const canShowInlineImages = supportsInlineImages()

  // Load thumbnail if terminal supports inline images (iTerm2/Kitty)
  useEffect(() => {
    if (!canShowInlineImages) return

    let cancelled = false

    const loadThumbnail = async () => {
      try {
        const imageData = fs.readFileSync(image.path)
        const base64Data = imageData.toString('base64')
        const sequence = renderInlineImage(base64Data, {
          width: INLINE_IMAGE_WIDTH,
          height: INLINE_IMAGE_HEIGHT,
          filename: image.filename,
        })
        if (!cancelled) {
          setThumbnailSequence(sequence)
        }
      } catch {
        // Failed to load image, will show icon fallback
        if (!cancelled) {
          setThumbnailSequence(null)
        }
      }
    }

    loadThumbnail()

    return () => {
      cancelled = true
    }
  }, [image.path, image.filename, canShowInlineImages])

  const truncatedName = truncateFilename(image.filename)

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.info,
        width: IMAGE_CARD_WIDTH,
        padding: 0,
      }}
      customBorderChars={BORDER_CHARS}
    >
      {/* Thumbnail or icon area with overlaid close button */}
      <box
        style={{
          height: 3,
          flexDirection: 'row',
          backgroundColor: theme.surface,
        }}
      >
        {/* Thumbnail/icon centered */}
        <box
          style={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {thumbnailSequence ? (
            <text>{thumbnailSequence}</text>
          ) : (
            <ImageThumbnail
              imagePath={image.path}
              width={THUMBNAIL_WIDTH}
              height={THUMBNAIL_HEIGHT}
              fallback={<text style={{ fg: theme.info }}>🖼️</text>}
            />
          )}
        </box>
        {/* Close button in top-right corner */}
        {showRemoveButton && onRemove && (
          <Button
            onClick={onRemove}
            onMouseOver={() => setIsCloseHovered(true)}
            onMouseOut={() => setIsCloseHovered(false)}
            style={{ paddingLeft: 0, paddingRight: 1 }}
          >
            <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>×</text>
          </Button>
        )}
      </box>

      {/* Filename only - full width */}
      <box
        style={{
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text
          style={{
            fg: theme.foreground,
            wrapMode: 'none',
          }}
        >
          {truncatedName}
        </text>
      </box>
    </box>
  )
}
