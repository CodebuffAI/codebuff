import { TextAttributes } from '@opentui/core'

import { DiffViewer } from './diff-viewer'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'

import type { ToolRenderConfig } from './types'

type PatchOperation =
  | { type: 'add'; path: string }
  | { type: 'delete'; path: string }
  | { type: 'update'; path: string; moveTo?: string; hunks: string }

function parsePatchOperations(rawPatch: string): PatchOperation[] {
  const normalized = rawPatch.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines.length < 2) return []
  if (lines[0] !== '*** Begin Patch') return []

  const ops: PatchOperation[] = []
  let i = 1
  const endIndex = lines.length - 1

  while (i < endIndex) {
    const line = lines[i]
    if (!line) {
      i++
      continue
    }

    if (line.startsWith('*** Add File: ')) {
      const filePath = line.slice('*** Add File: '.length)
      i++
      while (i < endIndex && !lines[i].startsWith('*** ')) {
        i++
      }
      ops.push({ type: 'add', path: filePath })
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const filePath = line.slice('*** Delete File: '.length)
      ops.push({ type: 'delete', path: filePath })
      i++
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const filePath = line.slice('*** Update File: '.length)
      i++

      let moveTo: string | undefined
      if (i < endIndex && lines[i].startsWith('*** Move to: ')) {
        moveTo = lines[i].slice('*** Move to: '.length)
        i++
      }

      const hunkLines: string[] = []
      while (i < endIndex && !lines[i].startsWith('*** ')) {
        if (lines[i] !== '*** End of File') {
          hunkLines.push(lines[i])
        }
        i++
      }

      const hunks = hunkLines.join('\n').trim()
      ops.push({ type: 'update', path: filePath, moveTo, hunks })
      continue
    }

    i++
  }

  return ops
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
}

const PatchOperationItem = ({ operation }: PatchOperationItemProps) => {
  if (operation.type === 'add') {
    return <EditHeader name="Create" filePath={operation.path} />
  }

  if (operation.type === 'delete') {
    return <EditHeader name="Delete" filePath={operation.path} />
  }

  const destination =
    operation.moveTo && operation.moveTo !== operation.path
      ? `${operation.path} → ${operation.moveTo}`
      : operation.path

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <EditHeader name="Edit" filePath={destination} />
      <box style={{ paddingLeft: 2, width: '100%' }}>
        <DiffViewer diffText={operation.hunks} />
      </box>
    </box>
  )
}

export const ApplyPatchComponent = defineToolComponent({
  toolName: 'apply_patch',

  render(toolBlock): ToolRenderConfig {
    const patch =
      toolBlock.input &&
      typeof toolBlock.input === 'object' &&
      'patch' in toolBlock.input &&
      typeof (toolBlock.input as { patch?: unknown }).patch === 'string'
        ? (toolBlock.input as { patch: string }).patch
        : ''

    const operations = patch ? parsePatchOperations(patch) : []

    if (operations.length === 0) {
      return { content: null }
    }

    return {
      content: (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          {operations.map((operation, index) => (
            <PatchOperationItem
              key={`${operation.type}-${operation.path}-${index}`}
              operation={operation}
            />
          ))}
        </box>
      ),
    }
  },
})