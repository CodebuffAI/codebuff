import { chunk, groupBy, orderBy } from 'lodash'
import { runScript } from 'run-script'
import { Row, tsToMillis } from 'common/supabase/utils'
import { getAllUsers } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ firestore, pg }) => {
    const users = await getAllUsers()
    const usersWithoutLastBetTime = users.filter(
      (a) => typeof a.lastBetTime !== 'number'
    )
    let totalFoundBets = 0
    const userChunks = chunk(usersWithoutLastBetTime, 500)
    for (const chunk of userChunks) {
      type cb = Row<'contract_bets'>
      let betsByUser: { [key: string]: cb[] } = {}
      const userIds = chunk.map((user) => user.id)
      console.log(
        'checking user ids',
        userIds.length,
        'slice',
        userIds.slice(0, 5)
      )
      const newBets = await pg.manyOrNone(
        `select * from contract_bets where user_id = ANY($1)`,
        [userIds]
      )
      if (!newBets || newBets.length == 0) {
        console.log('no bets found for users', userIds.slice(0, 5))
        continue
      }
      betsByUser = groupBy(newBets, (bet) => bet.user_id)

      console.log(
        'total users with bets in this chunk',
        Object.keys(betsByUser).length
      )
      for (const user of chunk) {
        const bets = orderBy(betsByUser[user.id], 'created_time', 'desc')
        if (!bets || bets.length == 0) continue
        const lastBet = bets[0]
        console.log('last bet', lastBet.created_time, 'for user', user.id)
        totalFoundBets++
        const userRef = firestore.doc(`users/${user.id}`)
        await userRef.update({ lastBetTime: tsToMillis(lastBet.created_time) })
      }
    }
    console.log('total found bets', totalFoundBets)
  })
}
