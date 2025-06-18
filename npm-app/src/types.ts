import { CostMode } from 'common/constants'

export type GitCommand = 'stage' | undefined

export interface CliOptions {
  initialInput?: string
  git: GitCommand
  costMode: CostMode
  runInitFlow?: boolean
  model?: string
}

/**
 * Utility type to make specific properties nullable
 */
export type MakeNullable<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? T[P] | null : T[P]
}
