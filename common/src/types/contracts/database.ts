import type { AgentTemplate } from '../agent-template'
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
  logger: Logger
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

type AgentRun = {
  agent_id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
}
export type AgentRunColumn = keyof AgentRun
export type GetAgentRunFromIdInput<T extends AgentRunColumn> = {
  agentRunId: string
  userId: string
  fields: readonly T[]
}
export type GetAgentRunFromIdOutput<T extends AgentRunColumn> = Promise<
  | {
      [K in T]: AgentRun[K]
    }
  | null
>
export type GetAgentRunFromIdFn = <T extends AgentRunColumn>(
  params: GetAgentRunFromIdInput<T>,
) => GetAgentRunFromIdOutput<T>

/**
 * Fetch and validate an agent from the database by `publisher/agent-id[@version]` format
 */
export type FetchAgentFromDatabaseFn = (params: {
  apiKey: string
  parsedAgentId: {
    publisherId: string
    agentId: string
    version?: string
  }
  logger: Logger
}) => Promise<AgentTemplate | null>

export type StartAgentRunFn = (params: {
  apiKey: string
  runId?: string
  userId?: string
  agentId: string
  ancestorRunIds: string[]
  logger: Logger
}) => Promise<string | null>

export type FinishAgentRunFn = (params: {
  apiKey: string
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
  apiKey: string
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
}) => Promise<string | null>

export type DatabaseAgentCache = Map<string, AgentTemplate | null>
