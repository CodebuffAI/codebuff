import { AttachmentCard } from './attachment-card'
import { useTheme } from '../hooks/use-theme'

import type { FileAttachment } from '../types/chat'
import type { PendingFileAttachment } from '../types/store'

const FILE_CARD_WIDTH = 20
const MAX_FILENAME_LENGTH = 16

const FILE_ICON_LINES = [
  '   ┌───╮',
  '   │ ≡ │',
  '   └───╯',
]

const FOLDER_ICON_LINES = [
  '  ╭──╮   ',
  '  │  ╰──╮',
  '  ╰─────╯',
]

const truncateFilename = (filename: string): string => {
  if (filename.length <= MAX_FILENAME_LENGTH) return filename
  // Find extension — ignore leading dot (dotfiles like .gitignore)
  const lastDot = filename.lastIndexOf('.')
  const hasExtension = lastDot > 0
  const ext = hasExtension ? filename.slice(lastDot) : ''
  const baseName = hasExtension ? filename.slice(0, lastDot) : filename
  const maxBaseLength = MAX_FILENAME_LENGTH - ext.length - 1 // -1 for ellipsis
  if (maxBaseLength <= 0) return filename.slice(0, MAX_FILENAME_LENGTH - 1) + '…'
  return baseName.slice(0, maxBaseLength) + '…' + ext
}

interface FileAttachmentCardProps {
  attachment: PendingFileAttachment | FileAttachment
  onRemove?: () => void
  showRemoveButton?: boolean
}

export const FileAttachmentCard = ({
  attachment,
  onRemove,
  showRemoveButton = true,
}: FileAttachmentCardProps) => {
  const theme = useTheme()
  const iconLines = attachment.isDirectory ? FOLDER_ICON_LINES : FILE_ICON_LINES
  const truncatedName = truncateFilename(attachment.filename)
  const status = 'status' in attachment ? attachment.status : undefined

  return (
    <AttachmentCard
      width={FILE_CARD_WIDTH}
      onRemove={onRemove}
      showRemoveButton={showRemoveButton}
    >
      {/* ASCII art icon area */}
      <box
        style={{
          height: 3,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <text style={{ fg: theme.info }}>
          {iconLines.join('\n')}
        </text>
      </box>

      {/* Filename and note */}
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
        {(status === 'processing' || attachment.note) && (
          <text
            style={{
              fg: status === 'error' ? theme.error : theme.muted,
              wrapMode: 'none',
            }}
          >
            {status === 'processing' ? 'reading…' : attachment.note}
          </text>
        )}
      </box>
    </AttachmentCard>
  )
}
