import { useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { IMAGE_CARD_BORDER_CHARS } from '../utils/ui-constants'

import type { PendingTextAttachment } from '../state/chat-store'

const TEXT_CARD_WIDTH = 24
const MAX_PREVIEW_LINES = 2

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
  const [isCloseHovered, setIsCloseHovered] = useState(false)

  // Preview is already processed (newlines replaced with spaces), truncate to fit
  const displayPreview =
    attachment.preview.slice(0, 40) +
    (attachment.preview.length > 40 ? '…' : '')

  return (
    <box style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {/* Main card with border */}
      <box
        style={{
          flexDirection: 'column',
          borderStyle: 'single',
          borderColor: theme.imageCardBorder,
          width: TEXT_CARD_WIDTH,
          padding: 0,
        }}
        customBorderChars={IMAGE_CARD_BORDER_CHARS}
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
              wrapMode: 'none',
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
      </box>

      {/* Close button outside the card */}
      {showRemoveButton && onRemove && (
        <Button
          onClick={onRemove}
          onMouseOver={() => setIsCloseHovered(true)}
          onMouseOut={() => setIsCloseHovered(false)}
          style={{ paddingLeft: 0, paddingRight: 0 }}
        >
          <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>[×]</text>
        </Button>
      )}
    </box>
  )
}
