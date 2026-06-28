import { TextAttributes } from '@opentui/core'

import { DiffViewer } from './diff-viewer'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'

import type { ToolRenderConfig } from './types'

type PatchOperation =
  | { type: 'create_file'; path: string; diff: string }
  | { type: 'update_file'; path: string; diff: string }
  | { type: 'delete_file'; path: string }

function parseOperation(input: unknown): PatchOperation | null {
  if (!input || typeof input !== 'object') return null
  const op = (input as { operation?: unknown }).operation
  if (!op || typeof op !== 'object') return null
  const { type, path, diff } = op as Record<string, unknown>
  if (typeof type !== 'string' || typeof path !== 'string') return null
  if (type === 'create_file' && typeof diff === 'string') {
    return { type: 'create_file', path, diff }
  }
  if (type === 'update_file' && typeof diff === 'string') {
    return { type: 'update_file', path, diff }
  }
  if (type === 'delete_file') {
    return { type: 'delete_file', path }
  }
  return null
}

interface EditHeaderProps {
  name: string
  filePath: string
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
        <span fg={theme.foreground}>{` ${filePath}`}</span>
      </text>
    </box>
  )
}

interface PatchOperationItemProps {
  operation: PatchOperation
  availableWidth: number
}

const PatchOperationItem = ({ operation, availableWidth }: PatchOperationItemProps) => {
  if (operation.type === 'delete_file') {
    return <EditHeader name="Delete" filePath={operation.path} />
  }

  const name = operation.type === 'create_file' ? 'Create' : 'Edit'
  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <EditHeader name={name} filePath={operation.path} />
      <box style={{ paddingLeft: 2, width: '100%' }}>
        <DiffViewer diffText={operation.diff} availableWidth={Math.max(10, availableWidth - 4)} />
      </box>
    </box>
  )
}

export const ApplyPatchComponent = defineToolComponent({
  toolName: 'apply_patch',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const operation = parseOperation(toolBlock.input)

    if (!operation) {
      return { content: null }
    }

    return {
      content: (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <PatchOperationItem
            operation={operation}
            availableWidth={options.availableWidth}
          />
        </box>
      ),
    }
  },
})
