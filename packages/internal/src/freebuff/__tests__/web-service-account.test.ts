import { describe, expect, it, mock } from 'bun:test'

// Mock postgres and env before any module that imports db/index.ts is loaded.
// db/index.ts calls postgres(env.DATABASE_URL) and drizzle() at the top level,
// which fails without real env vars / DB. These tests inject a fake db.
mock.module('postgres', () => ({
  default: () => ({
    options: { parsers: {}, serializers: {} },
  }),
}))
mock.module('@codebuff/internal/env', () => ({
  env: { DATABASE_URL: 'postgres://mock:mock@localhost:5432/mock' },
}))

const { getFreebuffWebServiceAccountApiKey } = await import(
  '../web-service-account'
)

type Db = NonNullable<
  Parameters<typeof getFreebuffWebServiceAccountApiKey>[0]
>['db']

function fakeDb(rows: { sessionToken: string }[]): Db {
  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  }
  return chain as unknown as Db
}

describe('getFreebuffWebServiceAccountApiKey', () => {
  it('returns the PAT when one exists', async () => {
    const key = await getFreebuffWebServiceAccountApiKey({
      db: fakeDb([{ sessionToken: 'cb-pat-abc' }]),
    })
    expect(key).toBe('cb-pat-abc')
  })

  it('returns null when the account has no valid PAT', async () => {
    const key = await getFreebuffWebServiceAccountApiKey({ db: fakeDb([]) })
    expect(key).toBeNull()
  })
})
