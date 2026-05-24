import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { getComposioToolsForUser as GetComposioToolsForUser } from '../composio'

let getComposioToolsForUser: typeof GetComposioToolsForUser

let createSession: ReturnType<typeof mock>
let useSession: ReturnType<typeof mock>
let getRawToolRouterSessionTools: ReturnType<typeof mock>

beforeAll(async () => {
  mock.module('server-only', () => ({}))
  mock.module('@codebuff/internal/env', () => ({
    env: { COMPOSIO_API_KEY: 'test-composio-api-key' },
  }))
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

  function makeDb(storedSessionId: string | null) {
    const findFirst = mock(async () =>
      storedSessionId
        ? {
            user_id: 'user-123',
            session_id: storedSessionId,
            created_at: new Date(),
            updated_at: new Date(),
          }
        : null,
    )
    const onConflictDoUpdate = mock(async () => undefined)
    const values = mock(() => ({ onConflictDoUpdate }))
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
      onConflictDoUpdate,
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
    const { db, whereDelete, values } = makeDb('stored-session')

    const result = await getComposioToolsForUser({
      db,
      userId: 'user-123',
      logger,
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
      }),
    ).rejects.toThrow('Composio unavailable')

    expect(whereDelete).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })
})
