import { z } from 'zod/v4'
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { logger } from '../util/logger'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { getAgentTemplate } from '../templates/agent-registry'

// Add short-lived cache for positive validations
const AGENT_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

type CacheEntry = {
  result: { valid: true; source?: string; normalizedId?: string }
  expiresAt: number
}

const agentValidationCache = new Map<string, CacheEntry>()

// Simple request schema
const validateAgentRequestSchema = z.object({
  agentId: z.string().min(1),
})

// GET /api/agents/validate-name
export async function validateAgentNameHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void | ExpressResponse> {
  try {
    // Log authentication headers if present (for debugging)
    const hasAuthHeader = !!req.headers.authorization
    const hasApiKey = !!req.headers['x-api-key']
    
    if (hasAuthHeader || hasApiKey) {
      logger.info(
        { 
          hasAuthHeader,
          hasApiKey,
          agentId: req.query.agentId,
        },
        'Agent validation request with authentication',
      )
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
    if (AGENT_PERSONAS[agentId as keyof typeof AGENT_PERSONAS]) {
      const result = { valid: true as const, source: 'builtin', normalizedId: agentId }
      agentValidationCache.set(agentId, {
        result,
        expiresAt: Date.now() + AGENT_VALIDATION_CACHE_TTL_MS,
      })
      return res.status(200).json(result)
    }

    // Check published agents (database)
    const found = await getAgentTemplate(agentId, {})
    if (found) {
      const result = {
        valid: true as const,
        source: 'published',
        normalizedId: found.id,
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
      return res.status(400).json({ valid: false, message: 'Invalid request', issues: error.issues })
    }
    next(error)
    return
  }
}
