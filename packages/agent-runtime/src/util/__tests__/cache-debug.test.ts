import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  createCacheDebugSnapshot,
  enrichCacheDebugSnapshotWithUsage,
  enrichCacheDebugSnapshotWithProviderRequest,
} from '../cache-debug'
import {
  systemMessage,
  userMessage,
} from '@codebuff/common/util/messages'
import type { CacheDebugCorrelation } from '@codebuff/common/util/cache-debug'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger

function makeMessage(role: Message['role'], content: unknown): Message {
  return {
    role,
    content,
    sentAt: 1_000,
  } as unknown as Message
}

describe('createCacheDebugSnapshot', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'cache-debug-test-'))
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  test('writes a snapshot to debug/cache-debug and returns a correlation', () => {
    const messages: Message[] = [makeMessage('user', 'hello')]
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 'system prompt',
      toolDefinitions: { tool1: { description: 't' } },
      messages,
      logger: noopLogger,
      projectRoot,
    })

    expect(correlation.snapshotId).toMatch(/^[0-9a-f-]{36}$/)
    expect(correlation.projectRoot).toBe(projectRoot)
    expect(correlation.filename).toMatch(/^000-base-[0-9a-f-]{36}\.json$/)

    const filePath = join(projectRoot, 'debug', 'cache-debug', correlation.filename)
    expect(existsSync(filePath)).toBe(true)
    const snapshot = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(snapshot.id).toBe(correlation.snapshotId)
    expect(snapshot.agentType).toBe('base')
    expect(snapshot.systemHash).toBeTruthy()
    expect(snapshot.toolsHash).toBeTruthy()
    expect(snapshot.preConversion.systemPrompt).toBe('system prompt')
    expect(snapshot.preConversion.toolDefinitions).toEqual({
      tool1: { description: 't' },
    })
    expect(snapshot.preConversion.messages).toHaveLength(1)
    expect(snapshot.preConversion.messages[0].role).toBe('user')
    expect(snapshot.preConversion.messages[0].content).toBe('hello')
  })

  test('sanitizes the agentType in the filename (replaces path separators)', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: '../escape/agent',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    // Every `/` is replaced with `_`. The `.` chars are allowed by the
    // sanitizer's allow-list ([A-Za-z0-9._-]), so the leading `..` survives —
    // but path.join can't escape because the index prefix is fixed and the
    // sanitizer already stripped the `/`s that would form path traversal.
    const baseName = correlation.filename
    expect(baseName).not.toContain('/')
    // Each `/` replaced by `_`; `.` is allowed so `..` stays.
    expect(baseName).toMatch(/^001-.._escape_agent-[0-9a-f-]{36}\.json$/)
  })

  test('uses "agent" as the fallback when agentType is empty', () => {
    // An empty agentType → empty string after sanitize → fallback "agent".
    // (Note: disallowed chars are replaced with `_`, not removed, so only a
    // truly empty input triggers the `|| 'agent'` fallback.)
    const correlation = createCacheDebugSnapshot({
      agentType: '',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    expect(correlation.filename).toMatch(/^002-agent-[0-9a-f-]{36}\.json$/)
  })

  test('sanitizes /// to ___ (not to the empty fallback)', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: '///',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    // `/` is disallowed → each replaced by `_`; the result "___" is non-empty
    // so it is used verbatim (the empty-fallback is only for truly-empty results).
    expect(correlation.filename).toMatch(/^003-___-[0-9a-f-]{36}\.json$/)
  })



  test('serializes Uint8Array content as a typed stub', () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const messages: Message[] = [makeMessage('tool', bytes)]
    createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages,
      logger: noopLogger,
      projectRoot,
    })
    const files = require('fs').readdirSync(join(projectRoot, 'debug', 'cache-debug'))
    const snapshot = JSON.parse(
      readFileSync(
        join(projectRoot, 'debug', 'cache-debug', files[0]),
        'utf8',
      ),
    )
    expect(snapshot.preConversion.messages[0].content).toEqual({
      type: 'Uint8Array',
      byteLength: 4,
    })
  })

  // M2: cache-debug snapshots now include per-anchor cache-control telemetry
  // (message index + content hash + anchor type) so snapshots can be diffed
  // across requests to detect anchor churn. Placed after filename-index tests
  // so the global cacheDebugCounter doesn't shift their expected indices.
  // Uses the real systemMessage/userMessage helpers so messages are
  // well-formed (system content is an array of text parts, not a raw string).
  test('M2: includes cacheAnchors telemetry with per-anchor attribution', () => {
    const messages: Message[] = [
      systemMessage('You are helpful'),
      userMessage('Context'),
      userMessage({
        content: 'User prompt',
        tags: ['USER_PROMPT'],
      }),
    ]

    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 'system prompt',
      toolDefinitions: {},
      messages,
      logger: noopLogger,
      projectRoot,
    })

    const filePath = join(projectRoot, 'debug', 'cache-debug', correlation.filename)
    const snapshot = JSON.parse(readFileSync(filePath, 'utf8'))

    expect(Array.isArray(snapshot.cacheAnchors)).toBe(true)
    expect(snapshot.cacheAnchors.length).toBeGreaterThanOrEqual(1)
    // Each anchor has type, index, contentHash, reason
    for (const anchor of snapshot.cacheAnchors) {
      expect(['system', 'stable-history', 'tail']).toContain(anchor.type)
      expect(typeof anchor.index).toBe('number')
      expect(typeof anchor.contentHash).toBe('string')
      expect(anchor.contentHash).toMatch(/^[0-9a-f]{8}$/)
      expect(typeof anchor.reason).toBe('string')
    }
    // System anchor should be present at index 0
    const systemAnchor = snapshot.cacheAnchors.find(
      (a: { type: string }) => a.type === 'system',
    )
    expect(systemAnchor).toBeDefined()
    expect(systemAnchor.index).toBe(0)
  })

  test('M2: cacheAnchors is an empty array for empty messages', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })

    const filePath = join(projectRoot, 'debug', 'cache-debug', correlation.filename)
    const snapshot = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(Array.isArray(snapshot.cacheAnchors)).toBe(true)
    expect(snapshot.cacheAnchors).toHaveLength(0)
  })
})

describe('enrichCacheDebugSnapshotWithUsage', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'cache-debug-enrich-'))
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  test('adds usage data to an existing snapshot', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 20,
      totalTokens: 160,
    }
    enrichCacheDebugSnapshotWithUsage({
      correlation,
      usage,
      logger: noopLogger,
    })

    const snapshot = readSnapshot(projectRoot, correlation)
    expect(snapshot.usage).toEqual(usage)
    expect(snapshot.cacheEfficiency).toEqual({
      cachedInputTokenRatio: 0.2,
      inputTokens: 100,
      cachedInputTokens: 20,
    })
  })

  test('warns when the snapshot file does not exist', () => {
    const warn = mock(() => {})
    const logger = { ...noopLogger, warn } as unknown as Logger
    enrichCacheDebugSnapshotWithUsage({
      correlation: {
        snapshotId: 'missing',
        filename: 'nope.json',
        projectRoot,
      },
      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, totalTokens: 2 },
      logger,
    })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('warns when the snapshot id does not match the correlation id', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    const warn = mock(() => {})
    const logger = { ...noopLogger, warn } as unknown as Logger
    enrichCacheDebugSnapshotWithUsage({
      correlation: { ...correlation, snapshotId: 'wrong-id' },
      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, totalTokens: 2 },
      logger,
    })
    expect(warn).toHaveBeenCalledTimes(1)
    // Original snapshot should be unchanged.
    const snapshot = readSnapshot(projectRoot, correlation)
    expect(snapshot.usage).toBeUndefined()
  })

  test('catches and logs errors from writeFileSync', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    const warn = mock(() => {})
    const logger = { ...noopLogger, warn } as unknown as Logger
    // Make the snapshot file unreadable by removing it mid-enrichment.
    rmSync(
      join(projectRoot, 'debug', 'cache-debug', correlation.filename),
      { force: true },
    )
    enrichCacheDebugSnapshotWithUsage({
      correlation,
      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, totalTokens: 2 },
      logger,
    })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('enrichCacheDebugSnapshotWithProviderRequest', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'cache-debug-prov-'))
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  test('adds providerRequest to an existing snapshot', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    const rawBody = { model: 'gpt-4', messages: [] }
    const normalized = { model: 'gpt-4' }
    enrichCacheDebugSnapshotWithProviderRequest({
      correlation,
      provider: 'openai',
      rawBody,
      normalized,
      logger: noopLogger,
    })

    const snapshot = readSnapshot(projectRoot, correlation)
    expect(snapshot.providerRequest).toEqual({
      provider: 'openai',
      rawBody,
      normalized,
    })
  })

  test('summarizes data-URLs inside the rawBody before storing', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    const dataUrl = 'data:image/png;base64,' + 'A'.repeat(100)
    enrichCacheDebugSnapshotWithProviderRequest({
      correlation,
      provider: 'openai',
      rawBody: { messages: [{ content: dataUrl }] },
      normalized: { messages: [{ content: dataUrl }] },
      logger: noopLogger,
    })

    const snapshot = readSnapshot(projectRoot, correlation)
    const rawContent = snapshot.providerRequest!.rawBody.messages[0].content
    expect(rawContent).toEqual({
      type: 'data-url',
      mediaType: 'image/png',
      payloadLength: dataUrl.split(',')[1].length,
      preview: dataUrl.split(',')[1].slice(0, 32),
    })
  })

  test('redacts prompt text and secret-like fields in stored provider requests', () => {
    const correlation = createCacheDebugSnapshot({
      agentType: 'base',
      system: 's',
      toolDefinitions: {},
      messages: [],
      logger: noopLogger,
      projectRoot,
    })
    const prompt = 'Explain this private repository code.'
    enrichCacheDebugSnapshotWithProviderRequest({
      correlation,
      provider: 'openai',
      rawBody: {
        messages: [{ role: 'user', content: prompt }],
        tools: [
          {
            headers: {
              Authorization: 'Bearer provider-secret',
              'X-Api-Key': 'api-secret',
            },
          },
        ],
      },
      normalized: { messages: [{ role: 'user', content: prompt }] },
      logger: noopLogger,
    })

    const snapshot = readSnapshot(projectRoot, correlation)
    const serialized = JSON.stringify(snapshot.providerRequest)
    const rawBody = snapshot.providerRequest!.rawBody
    const normalized = snapshot.providerRequest!.normalized

    expect(rawBody.messages[0].content).toEqual({
      type: 'redacted-text',
      length: prompt.length,
    })
    expect(normalized.messages[0].content).toEqual({
      type: 'redacted-text',
      length: prompt.length,
    })
    expect(rawBody.tools[0].headers.Authorization).toEqual({
      type: 'redacted-secret',
      length: 'Bearer provider-secret'.length,
    })
    expect(rawBody.tools[0].headers['X-Api-Key']).toEqual({
      type: 'redacted-secret',
      length: 'api-secret'.length,
    })
    expect(serialized).not.toContain(prompt)
    expect(serialized).not.toContain('provider-secret')
    expect(serialized).not.toContain('api-secret')
  })

  test('warns when the snapshot file is missing', () => {
    const warn = mock(() => {})
    const logger = { ...noopLogger, warn } as unknown as Logger
    enrichCacheDebugSnapshotWithProviderRequest({
      correlation: {
        snapshotId: 'x',
        filename: 'nope.json',
        projectRoot,
      },
      provider: 'openai',
      rawBody: {},
      normalized: {},
      logger,
    })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

function readSnapshot(projectRoot: string, correlation: CacheDebugCorrelation) {
  return JSON.parse(
    readFileSync(
      join(projectRoot, 'debug', 'cache-debug', correlation.filename),
      'utf8',
    ),
  )
}
