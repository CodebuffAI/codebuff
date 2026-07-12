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

const MAX_RETURNED_TODOS = 20

function getTodoSummary(todos: TodoItem[]): {
  totalCount: number
  completedCount: number
  remainingCount: number
  remainingTodos: TodoItem[]
} {
  const completedCount = todos.filter((t) => t.completed).length
  const remainingTodos = todos.filter((t) => !t.completed)
  return {
    totalCount: todos.length,
    completedCount,
    remainingCount: remainingTodos.length,
    remainingTodos: remainingTodos.slice(0, MAX_RETURNED_TODOS),
  }
}

// Simple Levenshtein distance for fuzzy matching tasks
function getSimilarity(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim()
  const b = s2.toLowerCase().trim()
  if (a === b) return 1.0
  if (!a || !b) return 0.0

  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  )

  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
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
  } catch (err) {
    // Folder creation may fail on read-only mounts / permissions; the read/write
    // paths below handle a missing dir, so don't abort — but surface it.
    console.debug(
      `[write-todos] mkdir failed for ${stateDir}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  // Load existing master list
  try {
    if (fs.existsSync(stateFilePath)) {
      const content = fs.readFileSync(stateFilePath, 'utf8')
      masterTodos = JSON.parse(content) as TodoItem[]
    }
  } catch (err) {
    // If invalid JSON or read error, start fresh rather than blocking the user.
    console.debug(
      `[write-todos] failed to read ${stateFilePath}, starting fresh: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    masterTodos = []
  }

  const mergedTodos: TodoItem[] = [...masterTodos]

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
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify(mergedTodos, null, 2),
      'utf8',
    )
  } catch (err) {
    // Persisting is best-effort; the in-memory list is returned to the model
    // regardless, but surface the failure so silent state loss is debuggable.
    console.debug(
      `[write-todos] failed to write ${stateFilePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  const todoSummary = getTodoSummary(incomingTodos)
  const persistedHistoricalSummary = getTodoSummary(mergedTodos)
  const historicalTodoCount = Math.max(
    0,
    persistedHistoricalSummary.totalCount - incomingTodos.length,
  )

  let message = `Todos written successfully. Current active progress: ${todoSummary.completedCount}/${todoSummary.totalCount} tasks completed.`
  if (historicalTodoCount > 0) {
    message += ` Historical master checklist persists ${persistedHistoricalSummary.totalCount} total task(s), including approximately ${historicalTodoCount} task(s) not shown in the current active list.`
  }

  return {
    output: jsonToolResult({
      message,
      todoSummary,
      currentTodos: incomingTodos.slice(0, MAX_RETURNED_TODOS),
      persistedHistoricalSummary: {
        totalCount: persistedHistoricalSummary.totalCount,
        completedCount: persistedHistoricalSummary.completedCount,
        remainingCount: persistedHistoricalSummary.remainingCount,
        historicalTodoCount,
      },
      masterTodosOmittedForLength: true,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
