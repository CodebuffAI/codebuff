import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { describe, test, expect, beforeEach } from 'bun:test'
import { NextRequest } from 'next/server'

import { getMe } from '../_get'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { GetUserInfoFromApiKeyOutput } from '@codebuff/common/types/contracts/database'

import { VALID_USER_INFO_FIELDS } from '@/db/user'

describe('/api/v1/me route', () => {
  const mockUserData: Record<
    string,
    NonNullable<
      Awaited<
        GetUserInfoFromApiKeyOutput<(typeof VALID_USER_INFO_FIELDS)[number]>
      >
    >
  > = {
    'test-api-key-123': {
      id: 'user-123',
      email: 'test@example.com',
      discord_id: 'discord-123',
    },
    'test-api-key-456': {
      id: 'user-456',
      email: 'test2@example.com',
      discord_id: null,
    },
  }

  let agentRuntimeImpl: AgentRuntimeDeps
  beforeEach(() => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      getUserInfoFromApiKey: async ({ apiKey, fields }) => {
        const userData = mockUserData[apiKey]
        if (!userData) {
          return null
        }
        return Object.fromEntries(
          fields.map((field) => [field, userData[field]]),
        ) as any
      },
    }
  })

  describe('Authentication', () => {
    test('returns 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/me')
      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Missing or invalid Authorization header' })
    })

    test('returns 401 when Authorization header is malformed', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/me', {
        headers: { Authorization: 'InvalidFormat' },
      })
      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toEqual({ error: 'Missing or invalid Authorization header' })
    })

    test('extracts API key from x-codebuff-api-key header', async () => {
      const apiKey = 'test-api-key-123'
      const req = new NextRequest('http://localhost:3000/api/v1/me', {
        headers: { 'x-codebuff-api-key': apiKey },
      })

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ id: 'user-123' })
    })

    test('extracts API key from Bearer token in Authorization header', async () => {
      const apiKey = 'test-api-key-123'
      const req = new NextRequest('http://localhost:3000/api/v1/me', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ id: 'user-123' })
    })

    test('returns 404 when API key is invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/me', {
        headers: { Authorization: 'Bearer invalid-key' },
      })

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body).toEqual({ error: 'Invalid API key or user not found' })
    })
  })

  describe('Field parameter validation', () => {
    test('defaults to id field when no fields parameter provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/me', {
        headers: { Authorization: 'Bearer test-api-key-123' },
      })

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ id: 'user-123' })
    })

    test('accepts single valid field', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=email',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ email: 'test@example.com' })
    })

    test('accepts multiple valid fields', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=id,email,discord_id',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        discord_id: 'discord-123',
      })
    })

    test('trims whitespace from field names', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=id, email , discord_id',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        discord_id: 'discord-123',
      })
    })

    test('returns 400 for invalid field names', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=invalid_field',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid fields: invalid_field')
      expect(body.error).toContain(
        `Valid fields are: ${VALID_USER_INFO_FIELDS.join(', ')}`,
      )
    })

    test('returns 400 for multiple invalid field names', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=invalid1,invalid2,email',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid fields: invalid1, invalid2')
    })

    test('returns 400 when mixing valid and invalid fields', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=id,bad_field,email',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(400)
    })
  })

  describe('Successful responses', () => {
    test('returns user data with default id field', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/me', {
        headers: { Authorization: 'Bearer test-api-key-123' },
      })

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ id: 'user-123' })
    })

    test('returns user data with single requested field', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=email',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ email: 'test@example.com' })
    })

    test('returns user data with multiple requested fields', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=id,email,discord_id',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        discord_id: 'discord-123',
      })
    })

    test('handles null discord_id correctly', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=id,discord_id',
        {
          headers: { Authorization: 'Bearer test-api-key-456' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ id: 'user-456', discord_id: null })
    })
  })

  describe('Edge cases', () => {
    test('handles empty fields parameter', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/me?fields=', {
        headers: { Authorization: 'Bearer test-api-key-123' },
      })

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid fields')
    })

    test('handles fields parameter with only commas', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=,,,',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(400)
    })

    test('handles case-sensitive field names', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/me?fields=ID,Email',
        {
          headers: { Authorization: 'Bearer test-api-key-123' },
        },
      )

      const response = await getMe({
        ...agentRuntimeImpl,
        req,
      })
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid fields: ID, Email')
    })
  })
})
