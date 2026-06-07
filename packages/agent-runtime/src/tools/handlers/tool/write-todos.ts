import * as fs from 'fs'
import * as path from 'path'
import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'write_todos'

type TodoItem = {
  task: string
  completed: boolean
}

// Simple Levenshtein distance for fuzzy matching tasks
function getSimilarity(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim()
  const b = s2.toLowerCase().trim()
  if (a === b) return 1.0
  if (!a || !b) return 0.0

  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      )
    }
  }

  const maxLen = Math.max(a.length, b.length)
  return 1.0 - d[m][n] / maxLen
}

export const handleWriteTodos = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall } = params

  await previousToolCallFinished

  const incomingTodos = (toolCall.input.todos as TodoItem[]) || []
  const stateDir = path.join(process.cwd(), '.omx/state')
  const stateFilePath = path.join(stateDir, 'todos-session.json')

  let masterTodos: TodoItem[] = []

  // Ensure state directory exists
  try {
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true })
    }
  } catch (e) {
    // Ignore folder creation errors
  }

  // Load existing master list
  try {
    if (fs.existsSync(stateFilePath)) {
      const content = fs.readFileSync(stateFilePath, 'utf8')
      masterTodos = JSON.parse(content) as TodoItem[]
    }
  } catch (e) {
    // If invalid JSON or read error, start fresh
    masterTodos = []
  }

  const mergedTodos: TodoItem[] = [...masterTodos]
  const preservedCountBefore = mergedTodos.length

  for (const incoming of incomingTodos) {
    // Try to find a match in master list
    let bestMatchIndex = -1
    let bestScore = 0.0

    for (let i = 0; i < mergedTodos.length; i++) {
      const score = getSimilarity(incoming.task, mergedTodos[i].task)
      if (score > bestScore) {
        bestScore = score
        bestMatchIndex = i
      }
    }

    if (bestScore >= 0.85 && bestMatchIndex !== -1) {
      // Update existing master todo
      mergedTodos[bestMatchIndex].completed = incoming.completed
      // Optionally update description if slightly changed (e.g. minor typos fixed)
      if (incoming.task.trim() !== mergedTodos[bestMatchIndex].task.trim()) {
        mergedTodos[bestMatchIndex].task = incoming.task
      }
    } else {
      // It's a new subtask or newly introduced task, append it
      mergedTodos.push({
        task: incoming.task,
        completed: incoming.completed,
      })
    }
  }

  // Save the new merged master list
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(mergedTodos, null, 2), 'utf8')
  } catch (e) {
    // Ignore write errors
  }

  const completedCount = mergedTodos.filter((t) => t.completed).length
  const totalCount = mergedTodos.length
  const newlyPreservedCount = mergedTodos.length - incomingTodos.length

  let message = `Todos written successfully. Current session progress: ${completedCount}/${totalCount} tasks completed.`
  if (newlyPreservedCount > 0) {
    message += ` Note: ${newlyPreservedCount} high-level task(s) from previous turns were preserved in the master checklist to prevent amnesia.`
  }

  return {
    output: jsonToolResult({
      message,
      masterTodos: mergedTodos,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
