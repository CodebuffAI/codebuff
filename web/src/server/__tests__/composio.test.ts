import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { executeComposioTool as ExecuteComposioTool } from '../composio'

let executeComposioTool: typeof ExecuteComposioTool

let createSession: ReturnType<typeof mock>
let useSession: ReturnType<typeof mock>
let execute: ReturnType<typeof mock>

function setEnvDefault(key: string, value: string) {
  process.env[key] ??= value
}

beforeAll(async () => {
  setEnvDefault('CI', 'true')
  setEnvDefault('NEXT_PUBLIC_CB_ENVIRONMENT', 'test')
  setEnvDefault('NEXT_PUBLIC_CODEBUFF_APP_URL', 'https://codebuff.test')
  setEnvDefault('NEXT_PUBLIC_SUPPORT_EMAIL', 'support@codebuff.test')
  setEnvDefault('NEXT_PUBLIC_POSTHOG_API_KEY', 'test-posthog-key')
  setEnvDefault('NEXT_PUBLIC_POSTHOG_HOST_URL', 'https://posthog.test')
  setEnvDefault('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test')
  setEnvDefault(
    'NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL',
    'https://stripe.test/portal',
  )
  setEnvDefault('NEXT_PUBLIC_WEB_PORT', '3000')

  mock.module('server-only', () => ({}))
  mock.module('@composio/core', () => ({
    Composio: class {
      create = createSession
      use = useSession
    },
  }))
  ;({ executeComposioTool } = await import('../composio'))
})

describe('executeComposioTool', () => {
  let logger: Logger

  beforeEach(() => {
    logger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    execute = mock(async () => ({ ok: true }))
    createSession = mock(async () => ({ sessionId: 'fresh-session', execute }))
    useSession = mock(async () => ({ sessionId: 'stored-session', execute }))
  })

  function makeDb(storedSessionIds: string | null | Array<string | null>) {
    const storedSessionIdSequence = Array.isArray(storedSessionIds)
      ? [...storedSessionIds]
      : [storedSessionIds]
    const findFirst = mock(async () => {
      const storedSessionId =
        storedSessionIdSequence.length > 1
          ? storedSessionIdSequence.shift()
          : storedSessionIdSequence[0]

      return storedSessionId
        ? {
            user_id: 'user-123',
            session_id: storedSessionId,
            created_at: new Date(),
            updated_at: new Date(),
          }
        : null
    })
    const onConflictDoNothing = mock(async () => undefined)
    const values = mock(() => ({ onConflictDoNothing }))
    const whereDelete = mock(async () => undefined)

    return {
      db: {
        query: {
          composioSession: {
            findFirst,
          },
        },
        insert: mock(() => ({ values })),
        delete: mock(() => ({ where: whereDelete })),
      } as any,
      findFirst,
      onConflictDoNothing,
      values,
      whereDelete,
    }
  }

  test('replaces a stored session when Composio can no longer rehydrate it', async () => {
    const notFound = Object.assign(new Error('Composio session not found'), {
      status: 404,
    })
    useSession = mock(async () => {
      throw notFound
    })
    const { db, whereDelete, values } = makeDb([
      'stored-session',
      'fresh-session',
    ])

    const result = await executeComposioTool({
      db,
      userId: 'user-123',
      logger,
      apiKey: 'test-composio-api-key',
      toolName: 'composio_search_tools',
      input: { queries: ['gmail'], session: { generate_id: true } },
    })

    expect(result).toEqual([{ type: 'json', value: { ok: true } }])
    expect(useSession).toHaveBeenCalledWith('stored-session')
    expect(whereDelete).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith('user-123', {
      workbench: { enable: false },
    })
    expect(values).toHaveBeenCalledWith({
      user_id: 'user-123',
      session_id: 'fresh-session',
    })
  })

  test('returns the persisted session when concurrent creation stores a different session', async () => {
    createSession = mock(async () => ({ sessionId: 'losing-session', execute }))
    useSession = mock(async () => ({ sessionId: 'winning-session', execute }))
    const { db, values, onConflictDoNothing } = makeDb([
      null,
      'winning-session',
    ])

    const result = await executeComposioTool({
      db,
      userId: 'user-123',
      logger,
      apiKey: 'test-composio-api-key',
      toolName: 'composio_search_tools',
      input: { queries: ['gmail'], session: { generate_id: true } },
    })

    expect(result).toEqual([{ type: 'json', value: { ok: true } }])
    expect(createSession).toHaveBeenCalledWith('user-123', {
      workbench: { enable: false },
    })
    expect(values).toHaveBeenCalledWith({
      user_id: 'user-123',
      session_id: 'losing-session',
    })
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1)
    expect(useSession).toHaveBeenCalledWith('winning-session')
    expect(execute).toHaveBeenCalledWith('COMPOSIO_SEARCH_TOOLS', {
      queries: ['gmail'],
      session: { generate_id: true },
    })
  })

  test('forces multi-execute workbench sync off before calling Composio', async () => {
    const { db } = makeDb('stored-session')

    const result = await executeComposioTool({
      db,
      userId: 'user-123',
      logger,
      apiKey: 'test-composio-api-key',
      toolName: 'composio_multi_execute_tool',
      input: {
        tools: [{ slug: 'GMAIL_FETCH_EMAILS', arguments: {} }],
        sync_response_to_workbench: true,
      },
    })

    expect(result).toEqual([{ type: 'json', value: { ok: true } }])
    expect(execute).toHaveBeenCalledWith('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [{ slug: 'GMAIL_FETCH_EMAILS', arguments: {} }],
      sync_response_to_workbench: false,
    })
  })

  test('keeps the stored session row when rehydration fails transiently', async () => {
    const transientError = Object.assign(new Error('Composio unavailable'), {
      status: 502,
    })
    useSession = mock(async () => {
      throw transientError
    })
    const { db, whereDelete } = makeDb('stored-session')

    await expect(
      executeComposioTool({
        db,
        userId: 'user-123',
        logger,
        apiKey: 'test-composio-api-key',
        toolName: 'composio_search_tools',
        input: { queries: ['gmail'], session: { generate_id: true } },
      }),
    ).rejects.toThrow('Composio unavailable')

    expect(whereDelete).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })
})
