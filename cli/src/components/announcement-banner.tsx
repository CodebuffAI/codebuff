import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

interface AnnouncementBannerProps {
  onClose: () => void
}

export const AnnouncementBanner = ({ onClose }: AnnouncementBannerProps) => {
  const { terminalWidth } = useTerminalDimensions()
  const theme = useTheme()

  return (
    <box
      key={terminalWidth}
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.secondary,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
        flexShrink: 0,
      }}
      border={['top', 'bottom', 'left', 'right']}
      customBorderChars={BORDER_CHARS}
    >
      <text
        style={{
          fg: theme.foreground,
          wrapMode: 'word',
          flexShrink: 1,
          marginRight: 3,
        }}
      >
        Codebuff has been updated with new UI! Tell us how it's going with{' '}
        <span style={{ fg: theme.secondary }}>/feedback</span>.
        <br />
        Revert to the old Codebuff with:{' '}
        <span style={{ fg: theme.secondary }}>
          npm install -g codebuff@legacy
        </span>
      </text>
      <Button onClick={onClose}>
        <text style={{ fg: theme.secondary }}>x</text>
      </Button>
    </box>
  )
}
