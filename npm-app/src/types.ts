import type { CostMode } from '@codebuff/common/constants'

export type GitCommand = 'stage' | undefined

export interface CliOptions {
  initialInput?: string
  git?: GitCommand
  costMode: CostMode
  runInitFlow?: boolean
  model?: string
  agent?: string
  params?: Record<string, any>
  print?: boolean
  cwd?: string
  trace?: boolean
}

/**
 * Utility type to make specific properties nullable
 */
export type MakeNullable<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? T[P] | null : T[P]
}
