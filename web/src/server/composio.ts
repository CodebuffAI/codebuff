import 'server-only'

import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

import {
  COMPOSIO_API_KEY_ENV_VAR,
  COMPOSIO_META_TOOL_NAMES,
} from '@codebuff/common/constants/composio'
import { getErrorObject } from '@codebuff/common/util/error'
import { env } from '@codebuff/internal/env'
import * as schema from '@codebuff/internal/db/schema'
import { Composio, type Tool } from '@composio/core'
import { and, eq } from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { JSONValue } from '@codebuff/common/types/json'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { CodebuffPgDatabase } from '@codebuff/internal/db/types'

const COMPOSIO_HOME_ENV_PATH = path.join(homedir(), 'codebuff', '.env.local')
const allowedToolNames = new Set<string>(COMPOSIO_META_TOOL_NAMES)

type ComposioSession = Awaited<ReturnType<Composio['create']>>
type ComposioClient = Composio

export type ComposioToolDefinition = {
  toolName: string
  inputSchema: Record<string, unknown>
  description: string
}

type CachedComposioSession = {
  userId: string
  sessionId: string
  session: ComposioSession
  tools: ComposioToolDefinition[]
}

const sessionsByUserId = new Map<string, Promise<CachedComposioSession>>()
const sessionsBySessionId = new Map<string, CachedComposioSession>()

function parseEnvFileValue(contents: string, key: string): string | undefined {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match || match[1] !== key) continue

    const value = match[2].trim()
    return value.replace(/^(['"])(.*)\1$/, '$2')
  }
  return undefined
}

function getComposioApiKey(): string | undefined {
  const configuredApiKey = env.COMPOSIO_API_KEY?.trim()
  if (configuredApiKey) return configuredApiKey

  if (!existsSync(COMPOSIO_HOME_ENV_PATH)) return undefined

  try {
    return parseEnvFileValue(
      readFileSync(COMPOSIO_HOME_ENV_PATH, 'utf8'),
      COMPOSIO_API_KEY_ENV_VAR,
    )?.trim()
  } catch {
    return undefined
  }
}

export function isComposioConfigured(): boolean {
  return !!getComposioApiKey()
}

function toJsonValue(value: unknown): JSONValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as JSONValue
  } catch {
    return String(value) as JSONValue
  }
}

function normalizeInputSchema(schema: Tool['inputParameters']) {
  if (schema && typeof schema === 'object') {
    const jsonSchema = JSON.parse(JSON.stringify(schema)) as Record<
      string,
      unknown
    >
    delete jsonSchema['$schema']
    return jsonSchema
  }

  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  } satisfies Record<string, unknown>
}

function getComposioClient(apiKey: string): ComposioClient {
  return new Composio({
    apiKey,
    host: 'codebuff',
  })
}

async function getToolDefinitionsForSession(params: {
  composio: ComposioClient
  sessionId: string
}): Promise<ComposioToolDefinition[]> {
  const rawTools = await params.composio.tools.getRawToolRouterSessionTools(
    params.sessionId,
  )

  return rawTools
    .filter((tool) => allowedToolNames.has(tool.slug))
    .map((tool) => ({
      toolName: tool.slug,
      inputSchema: normalizeInputSchema(tool.inputParameters),
      description: tool.description ?? `Execute ${tool.slug} with Composio.`,
    }))
}

async function saveSession(params: {
  db: CodebuffPgDatabase
  userId: string
  sessionId: string
}) {
  await params.db
    .insert(schema.composioSession)
    .values({
      user_id: params.userId,
      session_id: params.sessionId,
    })
    .onConflictDoUpdate({
      target: schema.composioSession.user_id,
      set: {
        session_id: params.sessionId,
        updated_at: new Date(),
      },
    })
}

async function getStoredSessionByUser(params: {
  db: CodebuffPgDatabase
  userId: string
}) {
  return params.db.query.composioSession.findFirst({
    where: eq(schema.composioSession.user_id, params.userId),
  })
}

async function getStoredSessionById(params: {
  db: CodebuffPgDatabase
  userId: string
  sessionId: string
}) {
  return params.db.query.composioSession.findFirst({
    where: and(
      eq(schema.composioSession.user_id, params.userId),
      eq(schema.composioSession.session_id, params.sessionId),
    ),
  })
}

async function createSessionForUser(params: {
  db: CodebuffPgDatabase
  userId: string
  apiKey: string
}): Promise<CachedComposioSession> {
  const composio = getComposioClient(params.apiKey)
  const session = await composio.create(params.userId)
  await saveSession({
    db: params.db,
    userId: params.userId,
    sessionId: session.sessionId,
  })

  const cachedSession: CachedComposioSession = {
    userId: params.userId,
    sessionId: session.sessionId,
    session,
    tools: await getToolDefinitionsForSession({
      composio,
      sessionId: session.sessionId,
    }),
  }

  sessionsBySessionId.set(cachedSession.sessionId, cachedSession)
  return cachedSession
}

async function rehydrateSession(params: {
  userId: string
  sessionId: string
  apiKey: string
  includeTools: boolean
}): Promise<CachedComposioSession> {
  const composio = getComposioClient(params.apiKey)
  const session = await composio.use(params.sessionId)
  const cachedSession: CachedComposioSession = {
    userId: params.userId,
    sessionId: params.sessionId,
    session,
    tools: params.includeTools
      ? await getToolDefinitionsForSession({
          composio,
          sessionId: params.sessionId,
        })
      : [],
  }

  if (params.includeTools) {
    sessionsByUserId.set(params.userId, Promise.resolve(cachedSession))
  }
  sessionsBySessionId.set(params.sessionId, cachedSession)
  return cachedSession
}

async function getCachedSession(params: {
  db: CodebuffPgDatabase
  userId: string
  logger: Logger
}): Promise<CachedComposioSession | null> {
  const apiKey = getComposioApiKey()
  if (!apiKey) return null

  let cached = sessionsByUserId.get(params.userId)
  if (!cached) {
    cached = (async () => {
      const storedSession = await getStoredSessionByUser({
        db: params.db,
        userId: params.userId,
      })
      if (storedSession) {
        params.logger.info(
          { userId: params.userId },
          'Rehydrating Composio session from database',
        )
        return rehydrateSession({
          userId: params.userId,
          sessionId: storedSession.session_id,
          apiKey,
          includeTools: true,
        })
      }

      params.logger.info(
        { userId: params.userId },
        'Creating new Composio session',
      )
      return createSessionForUser({
        db: params.db,
        userId: params.userId,
        apiKey,
      })
    })()
    sessionsByUserId.set(params.userId, cached)
  }

  try {
    return await cached
  } catch (error) {
    sessionsByUserId.delete(params.userId)
    params.logger.error(
      { error: getErrorObject(error), userId: params.userId },
      'Failed to initialize Composio session',
    )
    throw error
  }
}

export async function getComposioToolsForUser(params: {
  db: CodebuffPgDatabase
  userId: string
  logger: Logger
}): Promise<{ sessionId: string; tools: ComposioToolDefinition[] } | null> {
  const cached = await getCachedSession(params)
  if (!cached) return null

  return {
    sessionId: cached.sessionId,
    tools: cached.tools,
  }
}

export async function executeComposioTool(params: {
  db: CodebuffPgDatabase
  userId: string
  sessionId: string
  toolName: string
  input: Record<string, unknown>
}): Promise<ToolResultOutput[] | null> {
  if (!allowedToolNames.has(params.toolName)) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: `Unsupported Composio tool: ${params.toolName}`,
        },
      },
    ]
  }

  const apiKey = getComposioApiKey()
  if (!apiKey) return null

  let cached = sessionsBySessionId.get(params.sessionId)
  if (!cached) {
    const storedSession = await getStoredSessionById({
      db: params.db,
      userId: params.userId,
      sessionId: params.sessionId,
    })
    if (storedSession) {
      cached = await rehydrateSession({
        userId: params.userId,
        sessionId: params.sessionId,
        apiKey,
        includeTools: false,
      })
    }
  }

  if (!cached || cached.userId !== params.userId) {
    return null
  }

  try {
    const result = await cached.session.execute(params.toolName, params.input)
    return [{ type: 'json', value: toJsonValue(result) }]
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      },
    ]
  }
}
