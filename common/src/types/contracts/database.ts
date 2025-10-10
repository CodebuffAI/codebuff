import type { Logger } from './logger'

type User = {
  id: string
  email: string
  discord_id: string | null
}
export type UserColumn = keyof User
export type GetUserInfoFromApiKeyInput<T extends UserColumn> = {
  apiKey: string
  fields: readonly T[]
}
export type GetUserInfoFromApiKeyOutput<T extends UserColumn> = Promise<
  | {
      [K in T]: User[K]
    }
  | null
>
export type GetUserInfoFromApiKeyFn = <T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>,
) => GetUserInfoFromApiKeyOutput<T>

export type StartAgentRunFn = (params: {
  runId?: string
  userId?: string
  agentId: string
  ancestorRunIds: string[]
  logger: Logger
}) => Promise<string>

export type FinishAgentRunFn = (params: {
  userId: string | undefined
  runId: string
  status: 'completed' | 'failed' | 'cancelled'
  totalSteps: number
  directCredits: number
  totalCredits: number
  errorMessage?: string
  logger: Logger
}) => Promise<void>

export type AddAgentStepFn = (params: {
  userId: string | undefined
  agentRunId: string
  stepNumber: number
  credits?: number
  childRunIds?: string[]
  messageId: string | null
  status?: 'running' | 'completed' | 'skipped'
  errorMessage?: string
  startTime: Date
  logger: Logger
}) => Promise<string>
