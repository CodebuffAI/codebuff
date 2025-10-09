import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test'

import * as agentRegistry from '../../templates/agent-registry'
import { validateAgentNameHandler } from '../agents'

import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'

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

describe('validateAgentNameHandler', () => {
  const builtinAgentId = Object.keys(AGENT_PERSONAS)[0] || 'file-picker'

  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  it('returns valid=true for builtin agent ids', async () => {
    const req = createMockReq({ agentId: builtinAgentId })
    const res = createMockRes()

    await validateAgentNameHandler(req as any, res as any, noopNext)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalled()
    expect(res.jsonPayload.valid).toBe(true)
    expect(res.jsonPayload.source).toBe('builtin')
    expect(res.jsonPayload.normalizedId).toBe(builtinAgentId)
  })

  it('returns valid=true for published agent ids (publisher/name)', async () => {
    const agentId = 'codebuff/file-explorer'

    const spy = spyOn(agentRegistry, 'getAgentTemplate')
    spy.mockResolvedValueOnce({ id: 'codebuff/file-explorer@0.0.1' } as any)

    const req = createMockReq({ agentId })
    const res = createMockRes()

    await validateAgentNameHandler(req as any, res as any, noopNext)

    expect(spy).toHaveBeenCalledWith({
      agentId,
      localAgentTemplates: {},
      logger: expect.anything(),
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.jsonPayload.valid).toBe(true)
    expect(res.jsonPayload.source).toBe('published')
    expect(res.jsonPayload.normalizedId).toBe('codebuff/file-explorer@0.0.1')
  })

  it('returns valid=true for versioned published agent ids (publisher/name@version)', async () => {
    const agentId = 'codebuff/file-explorer@0.0.1'

    const spy = spyOn(agentRegistry, 'getAgentTemplate')
    spy.mockResolvedValueOnce({ id: agentId } as any)

    const req = createMockReq({ agentId })
    const res = createMockRes()

    await validateAgentNameHandler(req as any, res as any, noopNext)

    expect(spy).toHaveBeenCalledWith({
      agentId,
      localAgentTemplates: {},
      logger: expect.anything(),
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.jsonPayload.valid).toBe(true)
    expect(res.jsonPayload.source).toBe('published')
    expect(res.jsonPayload.normalizedId).toBe(agentId)
  })

  it('returns valid=false for unknown agents', async () => {
    const agentId = 'someorg/not-a-real-agent'

    const spy = spyOn(agentRegistry, 'getAgentTemplate')
    spy.mockResolvedValueOnce(null)

    const req = createMockReq({ agentId })
    const res = createMockRes()

    await validateAgentNameHandler(req as any, res as any, noopNext)

    expect(spy).toHaveBeenCalledWith({
      agentId,
      localAgentTemplates: {},
      logger: expect.anything(),
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.jsonPayload.valid).toBe(false)
  })

  it('returns 400 for invalid requests (missing agentId)', async () => {
    const req = createMockReq({})
    const res = createMockRes()

    await validateAgentNameHandler(req as any, res as any, noopNext)

    // Handler normalizes zod errors to 400
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.jsonPayload.valid).toBe(false)
    expect(res.jsonPayload.message).toBe('Invalid request')
  })

  it('returns 403 for requests without API key', async () => {
    const req = { query: { agentId: 'test' }, headers: {} } as any
    const res = createMockRes()

    await validateAgentNameHandler(req as any, res as any, noopNext)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.jsonPayload.valid).toBe(false)
    expect(res.jsonPayload.message).toBe('API key required')
  })
})
