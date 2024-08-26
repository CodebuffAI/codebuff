import { runScript } from 'run-script'
import { createAirdropNotification } from 'shared/create-notification'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { getUser } from 'shared/utils'

const AIR_DROP_AMOUNT = 10 * 1000

if (require.main === module) {
  runScript(async ({ pg }) => {
    const recentlyActiveUserIds = await pg.map<string>(
      `
      SELECT user_id, COUNT(DISTINCT DATE(contract_bets.created_time)) AS unique_bet_days
      FROM contract_bets
      WHERE contract_bets.created_time > '2024-01-01'
      GROUP BY user_id
      HAVING COUNT(DISTINCT DATE(contract_bets.created_time)) >= 30
      order by unique_bet_days desc
    `,
      [],
      (r) => r.user_id
    )

    console.log('Recently active users', recentlyActiveUserIds)

    let i = 0
    await pg.tx(async (tx) => {
      for (const userId of recentlyActiveUserIds) {
        console.log(
          'Airdropping to user',
          userId,
          i++,
          'of',
          recentlyActiveUserIds.length
        )
        const user = await getUser(userId)
        if (user)
          await createAirdropNotification(
            user,
            `airdrop-${userId}`,
            AIR_DROP_AMOUNT
          )
        await runTxnFromBank(tx, {
          fromType: 'BANK',
          toType: 'USER',
          toId: userId,
          amount: AIR_DROP_AMOUNT,
          category: 'AIR_DROP',
          token: 'M$',
          description: 'Pivot airdrop!',
        })
      }
    })

    console.log('Airdrop complete!')
  })
}
