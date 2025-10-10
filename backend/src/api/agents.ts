import { validateAgentNameHandlerHelper } from './validate-agent-name'
import { BACKEND_AGENT_RUNTIME_IMPL } from '../impl/agent-runtime'

import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'

// GET /api/agents/validate-name
export async function validateAgentNameHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void | ExpressResponse> {
  return validateAgentNameHandlerHelper({
    ...BACKEND_AGENT_RUNTIME_IMPL,
    req,
    res,
    next,
  })
}
