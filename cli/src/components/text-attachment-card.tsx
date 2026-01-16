import { AttachmentCard } from './attachment-card'
import { useTheme } from '../hooks/use-theme'

import type { PendingTextAttachment } from '../state/chat-store'

const TEXT_CARD_WIDTH = 24
const MAX_PREVIEW_LINES = 2
// Available width for text: card width - 2 (border) - 2 (padding) = 20 chars per line
const TEXT_CONTENT_WIDTH = TEXT_CARD_WIDTH - 4

interface TextAttachmentCardProps {
  attachment: PendingTextAttachment | { preview: string; charCount: number }
  onRemove?: () => void
  showRemoveButton?: boolean
}

export const TextAttachmentCard = ({
  attachment,
  onRemove,
  showRemoveButton = true,
}: TextAttachmentCardProps) => {
  const theme = useTheme()

  // Preview is already processed (newlines replaced with spaces)
  // Show as much as fits in the available space (width × lines)
  const maxPreviewChars = TEXT_CONTENT_WIDTH * MAX_PREVIEW_LINES
  const displayPreview =
    attachment.preview.slice(0, maxPreviewChars) +
    (attachment.preview.length > maxPreviewChars ? '…' : '')

  return (
    <AttachmentCard
      width={TEXT_CARD_WIDTH}
      onRemove={onRemove}
      showRemoveButton={showRemoveButton}
    >
      {/* Preview area */}
      <box
        style={{
          paddingLeft: 1,
          paddingRight: 1,
          height: 3,
          justifyContent: 'center',
        }}
      >
        <text
          style={{
            fg: theme.foreground,
            wrapMode: 'word',
          }}
        >
          {displayPreview || '(empty)'}
        </text>
      </box>

      {/* Footer with icon and char count */}
      <box
        style={{
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: 'row',
          gap: 1,
        }}
      >
        <text style={{ fg: theme.info }}>📄</text>
        <text
          style={{
            fg: theme.muted,
            wrapMode: 'none',
          }}
        >
          {attachment.charCount.toLocaleString()} chars
        </text>
      </box>
    </AttachmentCard>
  )
}
