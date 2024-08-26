import { convertUser } from 'common/supabase/users'
import { runScript } from 'run-script'
import { createManifestAirdropNotification } from 'shared/create-notification'
import { readCsv } from 'shared/helpers/file'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { getUserByUsername } from 'shared/utils'

const AIR_DROP_MANA_AMOUNT = 10 * 1000
const AIR_DROP_SPICE_AMOUNT = 5 * 1000

if (require.main === module) {
  runScript(async ({ pg }) => {
    const rows = await readCsv('./manifest-attendees.csv')
    if (!rows) throw new Error('Could not load CSV')
    const usernames = rows.map((o) => o.Username.replaceAll('@', '').trim())

    let i = 0
    for (const username of usernames) {
      console.log('Airdropping to user', username, i++, 'of', usernames.length)
      await pg.tx(async (tx) => {
        const user = await getUserByUsernameWithAttempts(username, tx)
        if (user) {
          console.log('Found user:', user.username)
          const userId = user.id
          await createManifestAirdropNotification(
            user,
            `manifest-airdrop-${userId}`,
            AIR_DROP_MANA_AMOUNT
          )
          await runTxnFromBank(tx, {
            fromType: 'BANK',
            toType: 'USER',
            toId: userId,
            amount: AIR_DROP_MANA_AMOUNT,
            category: 'MANIFEST_AIR_DROP',
            token: 'M$',
            description: 'Manifest airdrop!',
          })
          await runTxnFromBank(tx, {
            fromType: 'BANK',
            toType: 'USER',
            toId: userId,
            amount: AIR_DROP_SPICE_AMOUNT,
            category: 'MANIFEST_AIR_DROP',
            token: 'SPICE',
            description: 'Manifest airdrop!',
          })
        }
      })
    }

    console.log('Airdrop complete!')
  })
}

const getUserByUsernameWithAttempts = async (
  username: string,
  tx: SupabaseDirectClient
) => {
  const user = await getUserByUsername(username, tx)
  if (user) return user
  const possibleUsernames = await getUserByUsernameCaseInsensitive(username, tx)
  if (possibleUsernames.length === 1) {
    console.log(
      'Found user with different casing:',
      possibleUsernames[0].username
    )
    return possibleUsernames[0]
  }
  console.log('Could not find user:', username)
  return null
}

const getUserByUsernameCaseInsensitive = async (
  username: string,
  tx: SupabaseDirectClient
) => {
  const res = await tx.map(
    `select * from users
    where lower(username) = lower($1)`,
    [username],
    (r) => convertUser(r)
  )

  return res
}
