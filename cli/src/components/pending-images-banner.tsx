import { pluralize } from '@codebuff/common/util/string'

import { BottomBanner } from './bottom-banner'
import { ImageCard } from './image-card'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'

export const PendingImagesBanner = () => {
  const theme = useTheme()
  const pendingImages = useChatStore((state) => state.pendingImages)
  const removePendingImage = useChatStore((state) => state.removePendingImage)

  // Separate error messages from actual images, and count processing
  const errorImages: typeof pendingImages = []
  const validImages: typeof pendingImages = []
  let processingCount = 0
  for (const img of pendingImages) {
    if (img.status === 'error') {
      errorImages.push(img)
    } else {
      validImages.push(img)
      if (img.status === 'processing') {
        processingCount++
      }
    }
  }
  const readyCount = validImages.length - processingCount

  if (pendingImages.length === 0) {
    return null
  }

  // If we only have errors (no valid images), show just the error messages
  if (validImages.length === 0 && errorImages.length > 0) {
    return (
      <BottomBanner borderColorKey="error">
        {errorImages.map((image, index) => (
          <text key={`${image.path}-${index}`} style={{ fg: theme.error }}>
            {image.note} ({image.filename})
          </text>
        ))}
      </BottomBanner>
    )
  }

  return (
    <BottomBanner borderColorKey="imageCardBorder">
      {/* Error messages shown above the header */}
      {errorImages.map((image, index) => (
        <text key={`error-${image.path}-${index}`} style={{ fg: theme.error }}>
          {image.note} ({image.filename})
        </text>
      ))}

      {/* Header */}
      <text style={{ fg: theme.imageCardBorder }}>
        📎 {readyCount > 0 && `${pluralize(readyCount, 'image')} attached`}
        {readyCount > 0 && processingCount > 0 && ', '}
        {processingCount > 0 &&
          `${pluralize(processingCount, 'image')} processing`}
        {processingCount > 0 && ' (wait to send)'}
      </text>

      {/* Image cards in a horizontal row - only valid images */}
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {validImages.map((image, index) => (
          <ImageCard
            key={`${image.path}-${index}`}
            image={image}
            onRemove={() => removePendingImage(image.path)}
          />
        ))}
      </box>
    </BottomBanner>
  )
}
