import { getServiceAccountCredentials, initAdmin } from 'shared/init-admin'
initAdmin()
import { loadSecretsToEnv } from 'common/secrets'
import { getAllUsers } from 'shared/utils'
import { getRecentContractIds } from 'common/supabase/contracts'
import { createSupabaseClient } from 'shared/supabase/init'
import { setQuestScoreValue } from 'common/supabase/set-scores'
import { QUEST_DETAILS } from 'common/quest'
import { getReferralCount } from 'common/supabase/referrals'
import * as dayjs from 'dayjs'
const START_OF_WEEK = dayjs()
  .tz('America/Los_Angeles')
  .startOf('week')
  .add(1, 'day')
  .valueOf()
async function backfillSupabaseQuests() {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  try {
    const users = await getAllUsers()
    console.log(`Found ${users.length} users`)
    const db = createSupabaseClient()
    let count = 0
    const chunk = 2000
    const start = 21000
    const end = start + chunk
    console.log(`Processing users from ${start} to ${end}`)
    await Promise.all(
      users.slice(start, end).map(async (user) => {
        try {
          const marketsCreatedCount = (
            await getRecentContractIds(user.id, START_OF_WEEK, db)
          ).length
          if (marketsCreatedCount > 0) {
            await setQuestScoreValue(
              user.id,
              QUEST_DETAILS['MARKETS_CREATED'].scoreId,
              marketsCreatedCount,
              db
            )
          }
          const referralsCount = await getReferralCount(
            user.id,
            START_OF_WEEK,
            db
          )
          if (referralsCount > 0) {
            await setQuestScoreValue(
              user.id,
              QUEST_DETAILS['REFERRALS'].scoreId,
              referralsCount,
              db
            )
          }
          count++
          if (count % 100 === 0) console.log(`Processed ${count} users`)
        } catch (e) {
          console.error(`Error processing user ${user.id}`)
          console.error(e)
        }
      })
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) backfillSupabaseQuests().then(() => process.exit())
