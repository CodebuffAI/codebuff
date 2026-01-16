import { useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { IMAGE_CARD_BORDER_CHARS } from '../utils/ui-constants'

import type { ReactNode } from 'react'

export interface AttachmentCardProps {
  /** Width of the card in characters */
  width: number
  /** Content to render inside the bordered card. */
  children: ReactNode
  /** Callback when the remove button is clicked. If omitted, the button is hidden. */
  onRemove?: () => void
  /** Whether to show the remove button (default: true). Ignored if onRemove is not provided. */
  showRemoveButton?: boolean
}

/**
 * Shared attachment card shell used by image and text attachments.
 * Renders a bordered card with an optional 'X' remove button to the right.
 */
export const AttachmentCard = ({
  width,
  children,
  onRemove,
  showRemoveButton = true,
}: AttachmentCardProps) => {
  const theme = useTheme()
  const [isCloseHovered, setIsCloseHovered] = useState(false)

  const shouldShowClose = showRemoveButton && !!onRemove

  return (
    <box style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <box
        style={{
          flexDirection: 'column',
          borderStyle: 'single',
          borderColor: theme.imageCardBorder,
          width,
          padding: 0,
        }}
        customBorderChars={IMAGE_CARD_BORDER_CHARS}
      >
        {children}
      </box>

      {shouldShowClose ? (
        <Button
          onClick={onRemove}
          onMouseOver={() => setIsCloseHovered(true)}
          onMouseOut={() => setIsCloseHovered(false)}
          style={{ paddingLeft: 0, paddingRight: 0 }}
        >
          <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>X</text>
        </Button>
      ) : (
        // Keep layout aligned when there is no close button
        <box style={{ width: 1 }} />
      )}
    </box>
  )
}
