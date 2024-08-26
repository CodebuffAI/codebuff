import { runScript } from './run-script'
import { addUsersToPrivateMessageChannel } from 'shared/supabase/private-messages'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const loverIds = await pg.many(`select user_id from lovers`)
    const channelIds = await pg.many(
      `select id from private_user_message_channels where title is not null`
    )
    console.log(`Adding ${loverIds.length} users to channels:`, channelIds)
    await Promise.all(
      channelIds.map(
        async ({ id }) =>
          await addUsersToPrivateMessageChannel(
            loverIds.map((u) => u.user_id),
            id,
            pg
          )
      )
    )
  })
}
