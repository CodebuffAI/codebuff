import { CostMode } from 'common/constants'

export type GitCommand = 'stage' | undefined

export interface CliOptions {
  initialInput?: string
  git: GitCommand
  costMode: CostMode
}
