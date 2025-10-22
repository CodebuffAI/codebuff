import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'

import { validateAgentNameHandlerHelper } from '../validate-agent-name'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { FetchAgentFromDatabaseFn } from '@codebuff/common/types/contracts/database'
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

function createMockReq(query: Record<string, any>): Partial<ExpressRequest> {
  return {
    query,
    headers: { 'x-codebuff-api-key': 'test-api-key' },
  } as any
}

function createMockRes() {
  const res: Partial<ExpressResponse> & {
    statusCode?: number
    jsonPayload?: any
  } = {}
  res.status = mock((code: number) => {
    res.statusCode = code
    return res as ExpressResponse
  }) as any
  res.json = mock((payload: any) => {
    res.jsonPayload = payload
    return res as ExpressResponse
  }) as any
  return res as ExpressResponse & { statusCode?: number; jsonPayload?: any }
}

const noopNext: NextFunction = () => {}

function mockFetchAgentFromDatabase(
  returnValue: ReturnType<FetchAgentFromDatabaseFn>,
) {
  const spy = mock((input) => {
    return returnValue
  })
  agentRuntimeImpl = {
    ...agentRuntimeImpl,
    fetchAgentFromDatabase: spy,
  }
  return spy
}

describe('validateAgentNameHandler', () => {
  const builtinAgentId = Object.keys(AGENT_PERSONAS)[0] || 'file-picker'

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }
  })

  afterEach(() => {
    mock.restore()
  })

  it('returns valid=true for builtin agent ids', async () => {
    const req = createMockReq({ agentId: builtinAgentId })
    const res = createMockRes()

    await validateAgentNameHandlerHelper({
      ...agentRuntimeImpl,
      req: req as any,
      res: res as any,
      next: noopNext,
    })

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalled()
    expect(res.jsonPayload.valid).toBe(true)
    expect(res.jsonPayload.source).toBe('builtin')
    expect(res.jsonPayload.normalizedId).toBe(builtinAgentId)
  })

  it('returns valid=true for published agent ids (publisher/name)', async () => {
    const agentId = 'codebuff/file-explorer'

    const spy = mockFetchAgentFromDatabase(
      Promise.resolve({
        id: 'codebuff/file-explorer@0.0.1',
      } as any),
    )

    const req = createMockReq({ agentId })
    const res = createMockRes()

    await validateAgentNameHandlerHelper({
      ...agentRuntimeImpl,
      req: req as any,
      res: res as any,
      next: noopNext,
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        parsedAgentId: {
          publisherId: 'codebuff',
          agentId: 'file-explorer',
          version: undefined,
        },
      }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.jsonPayload.valid).toBe(true)
    expect(res.jsonPayload.source).toBe('published')
    expect(res.jsonPayload.normalizedId).toBe('codebuff/file-explorer@0.0.1')
  })

  it('returns valid=true for versioned published agent ids (publisher/name@version)', async () => {
    const agentId = 'codebuff/file-explorer@0.0.1'

    const spy = mockFetchAgentFromDatabase(
      Promise.resolve({
        id: agentId,
      } as any),
    )

    const req = createMockReq({ agentId })
    const res = createMockRes()

    await validateAgentNameHandlerHelper({
      ...agentRuntimeImpl,
      req: req as any,
      res: res as any,
      next: noopNext,
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        parsedAgentId: {
          publisherId: 'codebuff',
          agentId: 'file-explorer',
          version: '0.0.1',
        },
      }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.jsonPayload.valid).toBe(true)
    expect(res.jsonPayload.source).toBe('published')
    expect(res.jsonPayload.normalizedId).toBe(agentId)
  })

  it('returns valid=false for unknown agents', async () => {
    const agentId = 'someorg/not-a-real-agent'

    const spy = mockFetchAgentFromDatabase(Promise.resolve(null))

    const req = createMockReq({ agentId })
    const res = createMockRes()

    await validateAgentNameHandlerHelper({
      ...agentRuntimeImpl,
      req: req as any,
      res: res as any,
      next: noopNext,
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        parsedAgentId: {
          publisherId: 'someorg',
          agentId: 'not-a-real-agent',
          version: undefined,
        },
      }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.jsonPayload.valid).toBe(false)
  })

  it('returns 400 for invalid requests (missing agentId)', async () => {
    const req = createMockReq({})
    const res = createMockRes()

    await validateAgentNameHandlerHelper({
      ...agentRuntimeImpl,
      req: req as any,
      res: res as any,
      next: noopNext,
    })

    // Handler normalizes zod errors to 400
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.jsonPayload.valid).toBe(false)
    expect(res.jsonPayload.message).toBe('Invalid request')
  })

  it('returns 403 for requests without API key', async () => {
    const req = { query: { agentId: 'test' }, headers: {} } as any
    const res = createMockRes()

    await validateAgentNameHandlerHelper({
      ...agentRuntimeImpl,
      req: req as any,
      res: res as any,
      next: noopNext,
    })

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.jsonPayload.valid).toBe(false)
    expect(res.jsonPayload.message).toBe('API key required')
  })
})
