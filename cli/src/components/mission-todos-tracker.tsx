import React, { useMemo, useState } from 'react'
import fs from 'node:fs'
import { TextAttributes } from '@opentui/core'
import { useTheme } from '../hooks/use-theme'
import { getProjectRoot } from '../project-files'
import { getMissionPath } from '../missions/mission-store'
import { ClickableTitleBox } from './clickable-title-box'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ChatMessage, ToolContentBlock } from '../types/chat'

interface MissionTodosTrackerProps {
  messages: ChatMessage[]
}

export const MissionTodosTracker: React.FC<MissionTodosTrackerProps> = ({ messages }) => {
  const theme = useTheme()
  const projectRoot = getProjectRoot() ?? process.cwd()
  const [isExpanded, setIsExpanded] = useState(false)
  
  const missionJsonPath = useMemo(() => getMissionPath(projectRoot), [projectRoot, messages])

  const missionText = useMemo(() => {
    try {
      if (fs.existsSync(missionJsonPath)) {
        const data = JSON.parse(fs.readFileSync(missionJsonPath, 'utf8'))
        if (data.status === 'active' || data.status === 'completed' || data.status === 'blocked') {
           return { objective: data.objective, status: data.status }
        }
      }
    } catch {}
    return null
  }, [missionJsonPath, messages])

  const todos = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.blocks) {
        for (const block of msg.blocks) {
             if (block.type === 'tool' && (block as ToolContentBlock).toolName === 'write_todos') {
                try {
                   const input = (block as ToolContentBlock).input
                   if (input && Array.isArray(input.todos)) {
                      return input.todos as Array<{task: string, completed: boolean}>
                   }
                } catch {}
             }
        }
      }
    }
    return null
  }, [messages])

  if (!missionText && !todos) return null

  // Clean objective text for single line, heavily truncated to avoid Opentui dropping the title on small terminals
  const shortObjective = missionText?.objective 
    ? missionText.objective.replace(/[\r\n]+/g, ' ').substring(0, 30) + (missionText.objective.length > 30 ? '...' : '')
    : 'Sem meta definida'

  const completedCount = todos ? todos.filter(t => t.completed).length : 0
  const totalCount = todos ? todos.length : 0
  
  const title = ` META: ${shortObjective} | ETAPAS (${completedCount}/${totalCount}) [${isExpanded ? '▲' : '▼'}] `

  let visibleTodos = todos || []
  
  if (!isExpanded && todos && todos.length > 0) {
    const firstUncompletedIndex = todos.findIndex(t => !t.completed)
    const targetIndex = firstUncompletedIndex === -1 ? todos.length - 1 : firstUncompletedIndex
    visibleTodos = [todos[targetIndex]]
    // Attach index so we know which one it is
    visibleTodos[0] = { ...visibleTodos[0], originalIndex: targetIndex } as any
  } else if (todos) {
    visibleTodos = todos.map((t, idx) => ({ ...t, originalIndex: idx })) as any
  }

  return (
    <ClickableTitleBox
      title={title}
      onTitleClick={() => setIsExpanded(!isExpanded)}
      style={{ 
        flexDirection: 'column', 
        width: '100%', 
        marginBottom: 1, 
        paddingLeft: 1, 
        paddingRight: 1,
        borderStyle: 'single',
        customBorderChars: BORDER_CHARS,
        borderColor: theme.success,
      }}
    >
      {visibleTodos.map((todo: any) => (
         <box key={todo.originalIndex} style={{ flexDirection: 'row', width: '100%' }}>
           <text style={{ wrapMode: 'truncate' }}>
             {todo.completed ? (
               <>
                 <span fg={theme.success}>[x] </span>
                 <span fg={theme.muted} attributes={TextAttributes.STRIKETHROUGH}>{todo.task}</span>
               </>
             ) : (
               <>
                 <span fg={theme.primary}>[ ] </span>
                 <span fg={theme.foreground}>{todo.task}</span>
               </>
             )}
           </text>
         </box>
      ))}
    </ClickableTitleBox>
  )
}
