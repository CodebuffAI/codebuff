import { afterEach, describe, expect, test } from 'bun:test'

import { getMCPClientCacheKey } from '../client'

describe('getMCPClientCacheKey', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  test('includes remote headers in client identity without exposing raw secrets', () => {
    process.env.MCP_TOKEN_A = 'token-a'
    process.env.MCP_TOKEN_B = 'token-b'

    const baseConfig = {
      type: 'http' as const,
      url: 'https://mcp.example.com/rpc',
      params: { workspace: 'demo' },
      headers: { Authorization: 'Bearer $MCP_TOKEN_A' },
    }

    const firstKey = getMCPClientCacheKey(baseConfig)
    const secondKey = getMCPClientCacheKey({
      ...baseConfig,
      headers: { Authorization: 'Bearer $MCP_TOKEN_B' },
    })

    expect(firstKey).not.toBe(secondKey)
    expect(firstKey).toContain('mcp.example.com')
    expect(firstKey).not.toContain('token-a')
    expect(firstKey).not.toContain('Bearer $MCP_TOKEN_A')
    expect(secondKey).not.toContain('token-b')
  })

  test('includes stdio env identity without exposing resolved env values', () => {
    process.env.MCP_STDIO_TOKEN = 'stdio-secret'

    const key = getMCPClientCacheKey({
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { API_KEY: '$MCP_STDIO_TOKEN' },
    })

    expect(key).toContain('node')
    expect(key).not.toContain('stdio-secret')
    expect(key).not.toContain('$MCP_STDIO_TOKEN')
  })

  test('includes SSE headers in client identity', () => {
    const firstKey = getMCPClientCacheKey({
      type: 'sse',
      url: 'https://mcp.example.com/sse',
      params: {},
      headers: { 'X-Api-Key': 'first' },
    })
    const secondKey = getMCPClientCacheKey({
      type: 'sse',
      url: 'https://mcp.example.com/sse',
      params: {},
      headers: { 'X-Api-Key': 'second' },
    })

    expect(firstKey).not.toBe(secondKey)
    expect(firstKey).not.toContain('first')
    expect(secondKey).not.toContain('second')
  })

  test('normalizes duplicate header casing before hashing cache identity', () => {
    const duplicateCaseKey = getMCPClientCacheKey({
      type: 'http',
      url: 'https://mcp.example.com/rpc',
      params: {},
      headers: {
        Authorization: 'first-secret',
        authorization: 'last-secret',
      },
    })
    const normalizedKey = getMCPClientCacheKey({
      type: 'http',
      url: 'https://mcp.example.com/rpc',
      params: {},
      headers: { authorization: 'last-secret' },
    })

    expect(duplicateCaseKey).toBe(normalizedKey)
    expect(duplicateCaseKey).not.toContain('first-secret')
    expect(duplicateCaseKey).not.toContain('last-secret')
  })
})
