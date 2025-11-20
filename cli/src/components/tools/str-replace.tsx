import { TextAttributes } from '@opentui/core'

import { DiffViewer } from './diff-viewer'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'

import type { ToolRenderConfig } from './types'

function extractValueForKey(output: string, key: string): string | null {
  if (!output) return null
  const lines = output.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^\s*([A-Za-z0-9_]+):\s*(.*)$/)
    if (match && match[1] === key) {
      const rest = match[2]
      if (rest.trim().startsWith('|')) {
        const baseIndent = lines[i + 1]?.match(/^\s*/)?.[0].length ?? 0
        const acc: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j]
          const indent = l.match(/^\s*/)?.[0].length ?? 0
          if (l.trim().length === 0) {
            acc.push('')
            continue
          }
          if (indent < baseIndent) break
          acc.push(l.slice(baseIndent))
        }
        return acc.join('\n')
      } else {
        let val = rest.trim()
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1)
        }
        return val
      }
    }
  }
  return null
}

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
      {!isCreate && (
        <box style={{ paddingLeft: 2, width: '100%' }}>
          <DiffViewer diffText={diffText} />
        </box>
      )}
    </box>
  )
}

export const StrReplaceComponent = defineToolComponent({
  toolName: 'str_replace',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const outputStr =
      typeof toolBlock.output === 'string' ? toolBlock.output : ''
    const diff =
      extractValueForKey(outputStr, 'unifiedDiff') ||
      extractValueForKey(outputStr, 'patch')
    const filePath =
      extractValueForKey(outputStr, 'file') ||
      (typeof (toolBlock.input as any)?.path === 'string'
        ? (toolBlock.input as any).path
        : null)
    const message = extractValueForKey(outputStr, 'message')
    const isCreate = message === 'Created new file'

    return {
      content: (
        <EditBody
          name={isCreate ? 'Create' : 'Edit'}
          filePath={filePath}
          diffText={diff ?? ''}
          isCreate={isCreate}
        />
      ),
    }
  },
})
