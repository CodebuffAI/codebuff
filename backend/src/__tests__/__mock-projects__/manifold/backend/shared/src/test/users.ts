import { log } from 'shared/monitoring/log'
import { incrementBalance } from 'shared/supabase/users'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { randomString } from 'common/util/random'
import * as admin from 'firebase-admin'
import { createUserMain } from 'shared/create-user-main'

export const getTestUsers = async (
  firestore: admin.firestore.Firestore,
  pg: SupabaseDirectClient,
  limit: number
) => {
  const totalPrivateUsers = await pg.one(
    `select count(*) from private_users where data->>'email' ilike '%manifoldtestnewuser%'`
  )
  const missing = limit - totalPrivateUsers.count
  if (missing > 0) {
    log('No enough new users, will create ' + missing + ' more')
  }
  const auth = admin.app().auth()
  const missingUserIds = await Promise.all(
    Array.from({ length: missing }).map(async () => {
      const userCredential = await auth.createUser({
        email: 'manifoldTestNewUser+' + randomString() + '@gmail.com',
        password: randomString(),
        emailVerified: true,
        displayName: 'Manifold Test User',
      })
      log('success creating firebase user', userCredential.uid)
      await createUserMain(
        {
          adminToken: process.env.TEST_CREATE_USER_KEY,
        },
        userCredential.uid,
        '0.0.0.0',
        'localhost'
      )
      return userCredential.uid
    })
  )

  // add api keys
  await Promise.all(
    missingUserIds.map(async (id) => {
      return await pg.none(
        `update private_users set data = data || $2 where id = $1`,
        [id, JSON.stringify({ apiKey: crypto.randomUUID() })]
      )
    })
  )

  const privateUsers = await pg.map(
    `select id, data->>'apiKey' as api_key from private_users
              where data->>'email' ilike '%manifoldtestnewuser%'
              order by random()
              limit $1`,
    [limit],
    (r) => ({ id: r.id as string, apiKey: r.api_key as string })
  )
  log('got private users')
  await Promise.all(
    privateUsers.map((pu) =>
      incrementBalance(pg, pu.id, {
        balance: 10_000,
        totalDeposits: 10_000,
      })
    )
  )
  const apiKeysMissing = privateUsers.filter((p) => !p.apiKey)
  log(`${privateUsers.length} user balances incremented by 10k`)
  await Promise.all(
    apiKeysMissing.map(async (p) => {
      return await pg.none(
        `update private_users set data = data || $2 where id = $1`,
        [p.id, JSON.stringify({ apiKey: crypto.randomUUID() })]
      )
    })
  )
  if (apiKeysMissing.length > 0) {
    log('generated api keys for users')
    const refetchedUsers = await pg.map(
      `select id, data->>'apiKey' as api_key from private_users
              where id in ($1:list)
              `,
      [apiKeysMissing.map((p) => p.id)],
      (r) => ({ id: r.id as string, apiKey: r.api_key as string })
    )
    return [...refetchedUsers, ...privateUsers.filter((p) => !p.apiKey)]
  }
  return privateUsers
}
