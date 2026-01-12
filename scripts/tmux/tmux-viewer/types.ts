/**
 * Types for tmux session data (YAML format)
 */

export interface SessionInfo {
  session: string
  started: string
  started_local: string
  dimensions: {
    width: number
    height: number
  }
  status: 'active' | 'completed' | 'error'
}

export interface Command {
  timestamp: string
  type: 'text' | 'key'
  input: string
  auto_enter?: boolean
}

export interface CaptureFrontMatter {
  sequence: number
  label: string | null
  timestamp: string
  after_command: string | null
  dimensions: {
    width: number | string
    height: number | string
  }
}

export interface Capture {
  path: string
  filename: string
  frontMatter: CaptureFrontMatter
  content: string
}

export interface SessionData {
  sessionInfo: SessionInfo
  commands: Command[]
  captures: Capture[]
  sessionDir: string
}

export interface TimelineEntry {
  timestamp: string
  type: 'command' | 'capture'
  command?: Command
  capture?: Capture
  index: number
}

/**
 * JSON output format for AI consumption
 */
export interface SessionJSON {
  session: SessionInfo
  commands: Command[]
  captures: Array<{
    sequence: number
    label: string | null
    timestamp: string
    after_command: string | null
    dimensions: { width: number | string; height: number | string }
    path: string
    content: string
  }>
  timeline: Array<{
    timestamp: string
    type: 'command' | 'capture'
    data: Command | Capture
  }>
}
