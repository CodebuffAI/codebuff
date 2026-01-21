export type CliAgentMode = 'work' | 'review'

/**
 * Result type for tmux-start.sh JSON output.
 * The shell script outputs this JSON format to stdout.
 * See: scripts/tmux/tmux-start.sh
 */
export type TmuxStartResult =
  | { status: 'success'; sessionName: string }
  | { status: 'failure'; error: string }

export const CLI_AGENT_MODES: readonly CliAgentMode[] = ['work', 'review'] as const

export interface InputParamDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
}

/**
 * Extra input params that can be added to CLI agent configs.
 * Uses key remapping to exclude 'mode' at compile time (Omit on Record is a no-op).
 */
export type ExtraInputParams = {
  [K in string as K extends 'mode' ? never : K]?: InputParamDefinition
}

export interface CliAgentConfig {
  id: string
  displayName: string
  cliName: string
  /** Used for session naming, e.g., 'claude-code' -> sessions named 'claude-code-test' */
  shortName: string
  startCommand: string
  permissionNote: string
  model: string
  /** Default mode when mode param is not specified. Defaults to 'work' */
  defaultMode?: CliAgentMode
  spawnerPromptExtras?: string
  extraInputParams?: ExtraInputParams
  /** Custom instructions for work mode. If not provided, uses getWorkModeInstructions() */
  workModeInstructions?: string
  /** Custom instructions for review mode. If not provided, uses getDefaultReviewModeInstructions() */
  reviewModeInstructions?: string
  cliSpecificDocs?: string
  /** 
   * If true, skips the preparation phase before starting the tmux session.
   * Use this for agents that test the CLI itself (like codebuff-local-cli)
   * rather than external tools that need context gathering.
   */
  skipPrepPhase?: boolean
}
