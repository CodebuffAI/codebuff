import { TextAttributes } from '@opentui/core'
import { memo, useMemo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { calculateDisplaySize } from '../../utils/image-display'
import {
  renderInlineImage,
  supportsInlineImages,
  getImageSupportDescription,
} from '../../utils/terminal-images'

import type { ImageContentBlock } from '../../types/chat'

interface ImageBlockProps {
  block: ImageContentBlock
  availableWidth: number
}

export const ImageBlock = memo(({ block, availableWidth }: ImageBlockProps) => {
  const theme = useTheme()

  const { image, mediaType, filename, size, width, height } = block

  // Calculate display dimensions based on actual image dimensions
  const displaySize = useMemo(() => 
    calculateDisplaySize({ width, height, availableWidth }),
    [width, height, availableWidth]
  )

  // Try to render inline if supported
  const inlineSequence = useMemo(() => {
    if (!supportsInlineImages()) {
      return null
    }

    return renderInlineImage(image, {
      width: displaySize.width,
      height: displaySize.height,
      filename,
    })
  }, [image, filename, displaySize])

  // Format file size
  const formattedSize = useMemo(() => {
    if (!size) return null
    if (size < 1024) return `${size}B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
    return `${(size / (1024 * 1024)).toFixed(1)}MB`
  }, [size])

  // Get file extension for display
  const fileExtension = useMemo(() => {
    if (filename) {
      const parts = filename.split('.')
      return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : null
    }
    // Extract from mediaType
    const match = mediaType.match(/image\/(\w+)/)
    return match ? match[1].toUpperCase() : null
  }, [filename, mediaType])

  if (inlineSequence) {
    // Render inline image using terminal escape sequence
    return (
      <box style={{ flexDirection: 'column', gap: 0, marginTop: 1, marginBottom: 1 }}>
        {/* Image caption/metadata */}
        <text style={{ wrapMode: 'none', fg: theme.muted }}>
          <span attributes={TextAttributes.DIM}>📷 </span>
          <span>{filename || 'Image'}</span>
          {formattedSize && (
            <span attributes={TextAttributes.DIM}> ({formattedSize})</span>
          )}
        </text>
        
        {/* The actual inline image - rendered via escape sequence */}
        <text style={{ wrapMode: 'none' }}>{inlineSequence}</text>
      </box>
    )
  }

  // Fallback: Display image metadata when inline rendering not supported
  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        marginTop: 1,
        marginBottom: 1,
        paddingLeft: 1,
        borderStyle: 'single',
        borderColor: theme.border,
      }}
    >
      {/* Header */}
      <text style={{ wrapMode: 'none', fg: theme.foreground }}>
        <span attributes={TextAttributes.BOLD}>📷 Image Attachment</span>
      </text>

      {/* Filename */}
      {filename && (
        <text style={{ wrapMode: 'none', fg: theme.foreground }}>
          <span attributes={TextAttributes.DIM}>Name: </span>
          <span>{filename}</span>
        </text>
      )}

      {/* Type */}
      <text style={{ wrapMode: 'none', fg: theme.muted }}>
        <span attributes={TextAttributes.DIM}>Type: </span>
        <span>{fileExtension || mediaType}</span>
      </text>

      {/* Size */}
      {formattedSize && (
        <text style={{ wrapMode: 'none', fg: theme.muted }}>
          <span attributes={TextAttributes.DIM}>Size: </span>
          <span>{formattedSize}</span>
        </text>
      )}

      {/* Hint about terminal support */}
      <text
        style={{ wrapMode: 'word', fg: theme.muted, marginTop: 1 }}
        attributes={TextAttributes.DIM}
      >
        {`(${getImageSupportDescription()} - use iTerm2 or Kitty for inline display)`}
      </text>
    </box>
  )
})
