import { getAgentTemplate } from '@codebuff/agent-runtime/templates/agent-registry'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { z } from 'zod/v4'

import { extractAuthTokenFromHeader } from '../util/auth-helpers'
import { logger } from '../util/logger'

import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'

// Add short-lived cache for positive validations
const AGENT_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

type CacheEntry = {
  result: {
    valid: true
    source?: string
    normalizedId?: string
    displayName?: string
  }
  expiresAt: number
}

const agentValidationCache = new Map<string, CacheEntry>()

// Simple request schema
const validateAgentRequestSchema = z.object({
  agentId: z.string().min(1),
})

export async function validateAgentNameHandlerHelper(
  params: {
    req: ExpressRequest
    res: ExpressResponse
    next: NextFunction
  } & ParamsExcluding<
    typeof getAgentTemplate,
    'agentId' | 'localAgentTemplates'
  >,
): Promise<void | ExpressResponse> {
  const { req, res, next } = params

  try {
    // Check for x-codebuff-api-key header for authentication
    const apiKey = extractAuthTokenFromHeader(req)
    if (!apiKey) {
      return res.status(403).json({
        valid: false,
        message: 'API key required',
      })
    }

    // Parse from query instead (GET)
    const { agentId } = validateAgentRequestSchema.parse({
      agentId: String((req.query as any)?.agentId ?? ''),
    })

    // Check cache (positive results only)
    const cached = agentValidationCache.get(agentId)
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json({ ...cached.result, cached: true })
    } else if (cached) {
      agentValidationCache.delete(agentId)
    }

    // Check built-in agents first
    const persona = AGENT_PERSONAS[agentId as keyof typeof AGENT_PERSONAS]
    if (persona) {
      const result = {
        valid: true as const,
        source: 'builtin',
        normalizedId: agentId,
        displayName: persona.displayName,
      }
      agentValidationCache.set(agentId, {
        result,
        expiresAt: Date.now() + AGENT_VALIDATION_CACHE_TTL_MS,
      })
      return res.status(200).json(result)
    }

    // Check published agents (database)
    const found = await getAgentTemplate({
      ...params,
      agentId,
      localAgentTemplates: {},
    })
    if (found) {
      const result = {
        valid: true as const,
        source: 'published',
        normalizedId: found.id,
        displayName: found.displayName,
      }
      agentValidationCache.set(agentId, {
        result,
        expiresAt: Date.now() + AGENT_VALIDATION_CACHE_TTL_MS,
      })
      return res.status(200).json(result)
    }

    return res.status(200).json({ valid: false })
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error validating agent name',
    )
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid request',
        issues: error.issues,
      })
    }
    next(error)
    return
  }
}
