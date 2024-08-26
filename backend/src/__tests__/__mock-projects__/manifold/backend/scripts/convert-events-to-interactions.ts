import { runScript } from './run-script'

if (require.main === module) {
  runScript(async ({ pg }) => {
    let offset = 0
    while (true) {
      const userIds = await pg.map(
        `select id from users limit 25 offset $1`,
        [offset],
        (row) => row.id as string
      )
      if (userIds.length === 0) break

      offset += userIds.length
      const events = await pg.map(
        `select * from user_events where user_id = any($1)
                and name in ('click market card feed', 'bet')
                and contract_id is not null
                `,
        [userIds],
        (row) => row as any
      )
      console.log(
        `Processing ${events.length} events for ${userIds.length} users.
         Starting with id ${userIds[0]} & offset ${offset}`
      )
      if (events.length === 0) continue
      await Promise.all(
        userIds.map(async (userId) => {
          const userEvents = events.filter((e) => e.user_id === userId)
          if (userEvents.length === 0) return
          await Promise.all(
            userEvents.map(async (event) => {
              const isCardClick = event.name === 'click market card feed'
              const kind =
                !!event.data.isPromoted && isCardClick
                  ? 'promoted click'
                  : isCardClick
                  ? 'card click'
                  : event.data.location === 'feed card' ||
                    event.data.location === 'feed'
                  ? 'card bet'
                  : 'page bet'
              await pg.none(
                `insert into user_contract_interactions
                   (user_id, contract_id, name, created_time)
                    values ($1, $2, $3, $4)
              `,
                [userId, event.contract_id, kind, event.ts]
              )
              await pg.none(`delete from user_events where id = $1`, [event.id])
            })
          )
        })
      )
      console.log(`Processed ${events.length} events for ${offset} users`)
    }
  })
}
