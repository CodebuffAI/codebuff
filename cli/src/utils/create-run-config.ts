import path from 'path'

import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { isSensitiveEnvFilePath } from '@codebuff/common/util/env-file-path'

import {
  createEventHandler,
  createStreamChunkHandler,
} from './sdk-event-handlers'

import type { EventHandlerState } from './sdk-event-handlers'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  AgentDefinition,
  FileFilter,
  MessageContent,
  RunState,
} from '@codebuff/sdk'

export type CreateRunConfigParams = {
  logger: Logger
  agent: AgentDefinition | string
  prompt: string
  content: MessageContent[] | undefined
  previousRunState: RunState | null
  agentDefinitions: AgentDefinition[]
  eventHandlerState: EventHandlerState
  signal: AbortSignal
  costMode?: 'free' | 'lite' | 'normal' | 'max' | 'experimental' | 'ask'
  extraCodebuffMetadata?: Record<string, string>
  /** Periodic in-flight RunState checkpoints (see RunOptions.onStateSnapshot). */
  onStateSnapshot?: (runState: RunState) => void
}

const SENSITIVE_EXTENSIONS = new Set([
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.crt',
  '.cer',
])
const SENSITIVE_BASENAMES = new Set([
  '.htpasswd',
  '.netrc',
  'credentials',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  'auth.json',
  '.pypirc',
  'terraform.tfvars',
  '.terraformrc',
])

// Pattern matches (grouped by match type)
const SENSITIVE_PATTERNS = {
  prefix: ['id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa'], // SSH private keys
  suffix: ['_credentials'],
  substring: ['kubeconfig', '.tfstate'],
}

const matchesPattern = (str: string) =>
  SENSITIVE_PATTERNS.prefix.some(
    (p) => str.startsWith(p) && !str.endsWith('.pub'),
  ) ||
  SENSITIVE_PATTERNS.suffix.some((s) => str.endsWith(s)) ||
  SENSITIVE_PATTERNS.substring.some((sub) => str.includes(sub))

/**
 * Check if a file is a sensitive file that should be blocked from reading.
 */
export function isSensitiveFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  const basenameLower = basename.toLowerCase()
  const ext = path.extname(filePath).toLowerCase()

  return (
    isSensitiveEnvFilePath(filePath) ||
    SENSITIVE_EXTENSIONS.has(ext) ||
    SENSITIVE_BASENAMES.has(basenameLower) ||
    matchesPattern(basenameLower)
  )
}

export const createRunConfig = (params: CreateRunConfigParams) => {
  const {
    logger,
    agent,
    prompt,
    content,
    previousRunState,
    agentDefinitions,
    eventHandlerState,
    costMode,
    extraCodebuffMetadata,
    onStateSnapshot,
  } = params

  return {
    logger,
    agent,
    prompt,
    content,
    previousRun: previousRunState ?? undefined,
    agentDefinitions,
    maxAgentSteps: MAX_AGENT_STEPS_DEFAULT,
    handleStreamChunk: createStreamChunkHandler(eventHandlerState),
    handleEvent: createEventHandler(eventHandlerState),
    signal: params.signal,
    costMode,
    extraCodebuffMetadata,
    onStateSnapshot,
    fileFilter: ((filePath: string) => {
      if (isSensitiveFile(filePath)) return { status: 'blocked' }
      return { status: 'allow' }
    }) satisfies FileFilter,
  }
}
