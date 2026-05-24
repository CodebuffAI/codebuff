import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { getComposioToolsForUser as GetComposioToolsForUser } from '../composio'

let getComposioToolsForUser: typeof GetComposioToolsForUser

let createSession: ReturnType<typeof mock>
let useSession: ReturnType<typeof mock>
let getRawToolRouterSessionTools: ReturnType<typeof mock>

beforeAll(async () => {
  mock.module('server-only', () => ({}))
  mock.module('@composio/core', () => ({
    Composio: class {
      tools = {
        getRawToolRouterSessionTools,
      }

      create = createSession
      use = useSession
    },
  }))
  ;({ getComposioToolsForUser } = await import('../composio'))
})

describe('getComposioToolsForUser', () => {
  let logger: Logger

  beforeEach(() => {
    logger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    createSession = mock(async () => ({ sessionId: 'fresh-session' }))
    useSession = mock(async () => ({ sessionId: 'stored-session' }))
    getRawToolRouterSessionTools = mock(async () => [
      {
        slug: 'COMPOSIO_SEARCH_TOOLS',
        inputParameters: { type: 'object', properties: {} },
        description: 'Search tools',
      },
    ])
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

    const result = await getComposioToolsForUser({
      db,
      userId: 'user-123',
      logger,
      apiKey: 'test-composio-api-key',
    })

    expect(result).toEqual({
      sessionId: 'fresh-session',
      tools: [
        {
          toolName: 'COMPOSIO_SEARCH_TOOLS',
          inputSchema: { type: 'object', properties: {} },
          description: 'Search tools',
        },
      ],
    })
    expect(useSession).toHaveBeenCalledWith('stored-session')
    expect(whereDelete).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith('user-123')
    expect(values).toHaveBeenCalledWith({
      user_id: 'user-123',
      session_id: 'fresh-session',
    })
  })

  test('returns the persisted session when concurrent creation stores a different session', async () => {
    createSession = mock(async () => ({ sessionId: 'losing-session' }))
    useSession = mock(async () => ({ sessionId: 'winning-session' }))
    const { db, values, onConflictDoNothing } = makeDb([
      null,
      'winning-session',
    ])

    const result = await getComposioToolsForUser({
      db,
      userId: 'user-123',
      logger,
      apiKey: 'test-composio-api-key',
    })

    expect(result?.sessionId).toBe('winning-session')
    expect(createSession).toHaveBeenCalledWith('user-123')
    expect(values).toHaveBeenCalledWith({
      user_id: 'user-123',
      session_id: 'losing-session',
    })
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1)
    expect(useSession).toHaveBeenCalledWith('winning-session')
    expect(getRawToolRouterSessionTools).toHaveBeenCalledWith('winning-session')
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
      getComposioToolsForUser({
        db,
        userId: 'user-123',
        logger,
        apiKey: 'test-composio-api-key',
      }),
    ).rejects.toThrow('Composio unavailable')

    expect(whereDelete).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })
})
