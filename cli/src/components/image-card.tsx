import React, { useEffect, useState } from 'react'
import fs from 'fs'

import { Button } from './button'

import { useTheme } from '../hooks/use-theme'
import {
  supportsInlineImages,
  renderInlineImage,
} from '../utils/terminal-images'

const MAX_FILENAME_LENGTH = 18

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
  const canShowThumbnail = supportsInlineImages()

  // Load thumbnail if terminal supports inline images
  useEffect(() => {
    if (!canShowThumbnail) return

    try {
      const imageData = fs.readFileSync(image.path)
      const base64Data = imageData.toString('base64')
      const sequence = renderInlineImage(base64Data, {
        width: 4, // Small thumbnail width in cells
        height: 3, // Small thumbnail height in cells
        filename: image.filename,
      })
      setThumbnailSequence(sequence)
    } catch {
      // Failed to load image, will show icon fallback
      setThumbnailSequence(null)
    }
  }, [image.path, image.filename, canShowThumbnail])

  const truncatedName = truncateFilename(image.filename)

  return (
    <box
      style={{
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.info,
        width: 22,
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
            <text style={{ fg: theme.info }}>🖼️</text>
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
