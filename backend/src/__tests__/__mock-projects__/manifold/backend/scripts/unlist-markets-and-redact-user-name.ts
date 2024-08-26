import { runScript } from './run-script'
import { getUser } from 'shared/utils'
import { SupabaseClient } from 'common/supabase/utils'
import * as admin from 'firebase-admin'
import { filterDefined } from 'common/util/array'

if (require.main === module) {
  runScript(async ({ firestore, db }) => {
    const args = process.argv.slice(2)
    if (args.length < 1) {
      console.log(
        'Usage: ts-node unlist-markets-and-redact-user-name.ts [userid] [redactMarketNames (true, false, or blank)]  [overrideName (optional)]'
      )
    } else {
      await unlistMarketsAndRedactUserName(
        args[0],
        db,
        firestore,
        args[1],
        args[2]
      ).catch((e) => console.error(e))
    }
  })
}
const unlistMarketsAndRedactUserName = async (
  userId: string,
  db: SupabaseClient,
  firestore: admin.firestore.Firestore,
  redactMarketNames?: string,
  overrideName?: string
) => {
  const user = await getUser(userId)
  if (!user) {
    console.log('user not found')
    return
  }
  const markets = await db
    .from('contracts')
    .select('id')
    .eq('creator_id', userId)
  const marketIds = filterDefined(markets?.data?.map((m) => m.id) ?? [])
  const marketsCount = marketIds.length
  let processed = 0
  await Promise.all(
    marketIds.map(async (id) => {
      const marketRef = firestore.doc(`contracts/${id}`)
      await marketRef.update({ visibility: 'unlisted' })
      processed++
    })
  )
  console.log(`Processed ${processed} of ${marketsCount} markets`)

  const marketsWithUserName = await db
    .from('contracts')
    .select('question,id')
    .or(
      `question.ilike.%${overrideName ?? user.username}%,question.ilike.%${
        overrideName ?? user.name
      }%`
    )
  if (!marketsWithUserName.data) {
    console.log('no markets with user name found')
    return
  }
  console.log(
    `Found ${marketsWithUserName.data.length} markets with user`,
    'username',
    overrideName ?? user.username,
    'name',
    overrideName ?? user.name
  )
  console.log('Redacting names in markets? ', redactMarketNames === 'true')
  for (const marketWithUserName of marketsWithUserName.data) {
    console.log(marketWithUserName.question)
    if (redactMarketNames === 'true') {
      const marketRef = firestore.doc(`contracts/${marketWithUserName.id}`)
      await marketRef.update({
        question:
          marketWithUserName.question
            ?.replace(overrideName ?? user.username, '[redacted]')
            .replace(overrideName ?? user.name, '[redacted]') ?? '[redacted]',
      })
    }
  }
}
