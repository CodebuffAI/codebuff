import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import { Request, Response } from 'express'
import * as agentsApi from '../agents'
import * as agentsPublishApi from '../agents-publish'
import * as auth from '../../websockets/auth'

// Mock the auth function
const mockGetUserId = spyOn(auth, 'getUserIdFromAuthToken')

// Helper to create mock request/response objects
function createMockReq(
  body: any = {},
  headers: any = {},
  params: any = {}
): Partial<Request> {
  return {
    body,
    headers,
    params,
  }
}

function createMockRes(): Partial<Response> {
  const res: any = {}
  res.status = mock(() => res)
  res.json = mock(() => res)
  return res
}

const mockNext = mock(() => {})

beforeEach(() => {
  mockGetUserId.mockClear()
  mockNext.mockClear()
})

afterEach(() => {
  mockGetUserId.mockRestore()
  mockNext.mockRestore()
})

describe('Agent Publishing API', () => {
  describe('publishAgentHandler', () => {
    test('should return 401 when no auth header provided', async () => {
      const req = createMockReq()
      const res = createMockRes()

      await agentsPublishApi.publishAgentHandler(
        req as Request,
        res as Response,
        mockNext
      )

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
      })
    })

    test('should return 401 when auth token is invalid', async () => {
      mockGetUserId.mockResolvedValue(undefined)

      const req = createMockReq({}, { authorization: 'Bearer invalid-token' })
      const res = createMockRes()

      await agentsPublishApi.publishAgentHandler(
        req as Request,
        res as Response,
        mockNext
      )

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid authentication token',
      })
    })

    // Note: More complex tests would require database mocking
    // This test validates the basic validation logic works
  })

  describe('getAgentHandler', () => {
    test('should return 400 when missing required parameters', async () => {
      const req = createMockReq({}, {}, { publisherId: 'test' }) // Missing agentId and version
      const res = createMockRes()

      await agentsApi.getAgentHandler(req as Request, res as Response, mockNext)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required parameters',
      })
    })
  })

  describe('getLatestAgentHandler', () => {
    test('should return 400 when missing required parameters', async () => {
      const req = createMockReq({}, {}, { publisherId: 'test' }) // Missing agentId
      const res = createMockRes()

      await agentsApi.getLatestAgentHandler(
        req as Request,
        res as Response,
        mockNext
      )

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required parameters',
      })
    })
  })
})
