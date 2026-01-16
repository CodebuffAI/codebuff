import fs from 'fs'

import { useEffect, useState } from 'react'

import { AttachmentCard } from './attachment-card'
import { ImageThumbnail } from './image-thumbnail'
import { useTheme } from '../hooks/use-theme'
import {
  supportsInlineImages,
  renderInlineImage,
} from '../utils/terminal-images'

// Image card display constants
const MAX_FILENAME_LENGTH = 16
const IMAGE_CARD_WIDTH = 18
const THUMBNAIL_WIDTH = 14
const THUMBNAIL_HEIGHT = 3
const INLINE_IMAGE_WIDTH = 4
const INLINE_IMAGE_HEIGHT = 3

const truncateFilename = (filename: string): string => {
  if (filename.length <= MAX_FILENAME_LENGTH) {
    return filename
  }
  const lastDot = filename.lastIndexOf('.')
  const ext = lastDot !== -1 ? filename.slice(lastDot) : ''
  const baseName = lastDot !== -1 ? filename.slice(0, lastDot) : filename
  const maxBaseLength = MAX_FILENAME_LENGTH - ext.length - 1 // -1 for ellipsis
  return baseName.slice(0, maxBaseLength) + '…' + ext
}

export interface ImageCardImage {
  path: string
  filename: string
  status?: 'processing' | 'ready' | 'error' // Defaults to 'ready' if not provided
  note?: string // Display note: 'compressed' | error message
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
  const [thumbnailSequence, setThumbnailSequence] = useState<string | null>(
    null,
  )
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
    <AttachmentCard
      width={IMAGE_CARD_WIDTH}
      onRemove={onRemove}
      showRemoveButton={showRemoveButton}
    >
      {/* Thumbnail or icon area */}
      <box
        style={{
          height: THUMBNAIL_HEIGHT,
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

      {/* Filename - full width */}
      <box
        style={{
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'column',
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
        {((image.status ?? 'ready') === 'processing' || image.note) && (
          <text
            style={{
              fg: theme.muted,
              wrapMode: 'none',
            }}
          >
            {(image.status ?? 'ready') === 'processing'
              ? 'processing…'
              : image.note}
          </text>
        )}
      </box>
    </AttachmentCard>
  )
}
