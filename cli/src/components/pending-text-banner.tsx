import { BottomBanner } from './bottom-banner'
import { TextAttachmentCard } from './text-attachment-card'
import { useChatStore } from '../state/chat-store'

export const PendingTextBanner = () => {
  const pendingTextAttachments = useChatStore(
    (state) => state.pendingTextAttachments,
  )
  const removePendingTextAttachment = useChatStore(
    (state) => state.removePendingTextAttachment,
  )

  if (pendingTextAttachments.length === 0) {
    return null
  }

  return (
    <BottomBanner borderColorKey="imageCardBorder">
      {/* Text attachment cards in a horizontal row */}
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {pendingTextAttachments.map((attachment) => (
          <TextAttachmentCard
            key={attachment.id}
            attachment={attachment}
            onRemove={() => removePendingTextAttachment(attachment.id)}
          />
        ))}
      </box>
    </BottomBanner>
  )
}
