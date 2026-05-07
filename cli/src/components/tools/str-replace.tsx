import { TextAttributes } from '@opentui/core'

import { DiffViewer } from './diff-viewer'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import {
  extractDiff,
  extractFilePath,
  isCreateFile,
  shouldShowEditDiff,
} from '../../utils/implementor-helpers'

import type { ToolRenderConfig } from './types'

interface EditHeaderProps {
  name: string
  filePath: string | null
}

const EditHeader = ({ name, filePath }: EditHeaderProps) => {
  const theme = useTheme()
  const bulletChar = '• '

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.foreground}>{bulletChar}</span>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {name}
        </span>
        {filePath ? <span fg={theme.foreground}>{` ${filePath}`}</span> : null}
      </text>
    </box>
  )
}

interface EditBodyProps {
  name: string
  filePath: string | null
  diffText: string
  isCreate: boolean
}

const EditBody = ({ name, filePath, diffText, isCreate }: EditBodyProps) => {
  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      <EditHeader name={name} filePath={filePath} />
      {!isCreate && diffText.length > 0 && (
        <box style={{ paddingLeft: 2, width: '100%' }}>
          <DiffViewer diffText={diffText} />
        </box>
      )}
    </box>
  )
}

export const StrReplaceComponent = defineToolComponent({
  toolName: 'str_replace',

  render(toolBlock): ToolRenderConfig {
    const diff = extractDiff(toolBlock)
    const filePath = extractFilePath(toolBlock)
    const isCreate = isCreateFile(toolBlock)
    const showDiff = shouldShowEditDiff(toolBlock)

    return {
      content: (
        <EditBody
          name={isCreate ? 'Create' : 'Edit'}
          filePath={filePath}
          diffText={showDiff ? (diff ?? '') : ''}
          isCreate={isCreate}
        />
      ),
    }
  },
})
