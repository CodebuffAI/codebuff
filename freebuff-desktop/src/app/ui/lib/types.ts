/** Client-side mirror of the backend thread-model types (see src/core/types.ts). */

export type ThreadStatus = 'open' | 'closed'
export type TurnState = 'idle' | 'running'

export interface Thread {
  id: string
  projectId: string
  title: string
  status: ThreadStatus
  autorun: boolean
  branch: string | null
  worktreePath: string | null
  baseRef: string | null
  prUrl: string | null
  turnState: TurnState
  createdAt: number
  updatedAt: number
}

export type QueueItemState = 'queued' | 'running' | 'done' | 'suggested'
export type QueueItemSource = 'user' | 'assistant' | 'skill' | 'workflow'

export interface QueueItem {
  id: string
  threadId: string
  prompt: string
  label: string | null
  state: QueueItemState
  source: QueueItemSource
  skillName: string | null
  workflowRunId: string | null
  workflowName: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface ToolCall {
  id: string
  toolName: string
  input: unknown
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: ToolCall[]
  /** False while the assistant message is still streaming. */
  done: boolean
}

export interface Skill {
  name: string
  prompt: string
  builtin: boolean
}

export interface Workflow {
  name: string
  skills: string[]
}

export interface Snapshot {
  project: { id: string; defaultBranch: string; rootPath: string }
  threads: Thread[]
  usage: { costSpent: number; running: number }
}

/** SSE event shapes emitted by the server (see EngineEvent). */
export type ServerEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'thread'; threadId: string; thread: Thread; items: QueueItem[] }
  | { type: 'agent'; threadId: string; event: AgentEvent }
  | { type: 'prompt'; threadId: string; text: string }
  | { type: 'log'; message: string }

/** A subset of the SDK PrintModeEvent we render. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolName: string; input: unknown; toolCallId?: string }
  | { type: 'tool_result'; toolName?: string; toolCallId?: string }
  | { type: 'finish'; totalCost?: number }
  | { type: string; [k: string]: unknown }
