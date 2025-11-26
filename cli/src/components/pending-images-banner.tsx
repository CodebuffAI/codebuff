import { ImageCard } from './image-card'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import { BORDER_CHARS } from '../utils/ui-constants'

export const PendingImagesBanner = () => {
  const theme = useTheme()
  const { width } = useTerminalLayout()
  const pendingImages = useChatStore((state) => state.pendingImages)
  const removePendingImage = useChatStore((state) => state.removePendingImage)

  if (pendingImages.length === 0) {
    return null
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        marginLeft: width.is('sm') ? 0 : 1,
        marginRight: width.is('sm') ? 0 : 1,
        borderStyle: 'single',
        borderColor: theme.info,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
      }}
      border={['bottom', 'left', 'right']}
      customBorderChars={BORDER_CHARS}
    >
      {/* Header */}
      <text style={{ fg: theme.info }}>
        📎 {pendingImages.length} image{pendingImages.length > 1 ? 's' : ''}{' '}
        attached
      </text>

      {/* Image cards in a horizontal row */}
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {pendingImages.map((image, index) => (
          <ImageCard
            key={`${image.path}-${index}`}
            image={image}
            onRemove={() => removePendingImage(image.path)}
          />
        ))}
      </box>
    </box>
  )
}
