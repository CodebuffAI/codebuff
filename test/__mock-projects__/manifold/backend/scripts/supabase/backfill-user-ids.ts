import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
initAdmin()
import { createSupabaseClient } from 'shared/supabase/init'

const firestore = admin.firestore()

const main = async () => {
  const db = createSupabaseClient()

  // get all api keys from discord_users table
  const { data: discordUsers, error } = await db
    .from('discord_users')
    .select('api_key')
  if (error) {
    console.log('error getting discord users', error)
    return
  }
  const discordUserApiKeys = discordUsers.map((user) => user.api_key)
  // get user ids for all api keys and fill them in the user_id column in discord_users table
  await Promise.all(
    discordUserApiKeys.map(async (apiKey) => {
      const userId = (
        await firestore
          .collection('private-users')
          .where('apiKey', '==', apiKey)
          .get()
      ).docs[0].id
      if (!userId) {
        console.log('no user id found for api key', apiKey)
        return
      }
      console.log('found user id', userId, 'for api key', apiKey)
      const { error } = await db
        .from('discord_users')
        .update({ user_id: userId })
        .match({ api_key: apiKey })
      if (error) {
        console.log('error updating discord user', error)
        return
      }
    })
  )
}

if (require.main === module) main().then(() => process.exit())
