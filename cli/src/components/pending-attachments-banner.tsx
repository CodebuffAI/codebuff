import { BottomBanner } from './bottom-banner'
import { ImageCard } from './image-card'
import { TextAttachmentCard } from './text-attachment-card'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'

import type { PendingImageAttachment, PendingTextAttachment } from '../types/store'

/**
 * Combined banner for both image and text attachments.
 * Displays all attachments in a single horizontal row.
 */
export const PendingAttachmentsBanner = () => {
  const theme = useTheme()
  const pendingAttachments = useChatStore((state) => state.pendingAttachments)
  const removePendingAttachment = useChatStore(
    (state) => state.removePendingAttachment,
  )

  // Split and categorize attachments
  const pendingImages = pendingAttachments.filter(
    (a): a is PendingImageAttachment => a.kind === 'image',
  )
  const pendingTextAttachments = pendingAttachments.filter(
    (a): a is PendingTextAttachment => a.kind === 'text',
  )

  // Separate error messages from actual images
  const errorImages: PendingImageAttachment[] = []
  const validImages: PendingImageAttachment[] = []
  for (const img of pendingImages) {
    if (img.status === 'error') {
      errorImages.push(img)
    } else {
      validImages.push(img)
    }
  }

  const hasValidImages = validImages.length > 0
  const hasTextAttachments = pendingTextAttachments.length > 0
  const hasErrorsOnly = errorImages.length > 0 && !hasValidImages && !hasTextAttachments

  // Nothing to show
  if (!hasValidImages && !hasTextAttachments && errorImages.length === 0) {
    return null
  }

  // If we only have errors (no valid attachments), show just the error messages
  if (hasErrorsOnly) {
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
      {/* Error messages shown above the attachments */}
      {errorImages.map((image, index) => (
        <text key={`error-${image.path}-${index}`} style={{ fg: theme.error }}>
          {image.note} ({image.filename})
        </text>
      ))}

      {/* All attachment cards in a horizontal row */}
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {/* Image cards */}
        {validImages.map((image, index) => (
          <ImageCard
            key={`img-${image.path}-${index}`}
            image={image}
            onRemove={() => removePendingAttachment(image.path)}
          />
        ))}

        {/* Text attachment cards */}
        {pendingTextAttachments.map((attachment) => (
          <TextAttachmentCard
            key={attachment.id}
            attachment={attachment}
            onRemove={() => removePendingAttachment(attachment.id)}
          />
        ))}
      </box>
    </BottomBanner>
  )
}
