import path from 'path'

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
  costMode?: 'free' | 'normal' | 'max' | 'experimental' | 'ask'
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

const isEnvFile = (basename: string) =>
  (basename === '.env' || basename.startsWith('.env.')) &&
  !isEnvTemplateFile(basename)

const matchesPattern = (str: string) =>
  SENSITIVE_PATTERNS.prefix.some(
    (p) => str.startsWith(p) && !str.endsWith('.pub'),
  ) ||
  SENSITIVE_PATTERNS.suffix.some((s) => str.endsWith(s)) ||
  SENSITIVE_PATTERNS.substring.some((sub) => str.includes(sub))

const ENV_TEMPLATE_SUFFIXES = ['.env.example', '.env.sample', '.env.template']

export const isEnvTemplateFile = (filePath: string) =>
  ENV_TEMPLATE_SUFFIXES.some((suffix) =>
    path.basename(filePath).endsWith(suffix),
  )

/**
 * Check if a file is a sensitive file that should be blocked from reading.
 */
export function isSensitiveFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  const basenameLower = basename.toLowerCase()
  const ext = path.extname(filePath).toLowerCase()

  return (
    isEnvFile(basename) ||
    SENSITIVE_EXTENSIONS.has(ext) ||
    SENSITIVE_BASENAMES.has(basename) ||
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
  } = params

  return {
    logger,
    agent,
    prompt,
    content,
    previousRun: previousRunState ?? undefined,
    agentDefinitions,
    maxAgentSteps: 100,
    handleStreamChunk: createStreamChunkHandler(eventHandlerState),
    handleEvent: createEventHandler(eventHandlerState),
    signal: params.signal,
    costMode,
    fileFilter: ((filePath: string) => {
      if (isSensitiveFile(filePath)) return { status: 'blocked' }
      if (isEnvTemplateFile(filePath)) return { status: 'allow-example' }
      return { status: 'allow' }
    }) satisfies FileFilter,
  }
}
