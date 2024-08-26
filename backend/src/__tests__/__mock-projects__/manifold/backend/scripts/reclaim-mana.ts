import { chunk, sumBy } from 'lodash'
import { runScript } from './run-script'
import { runTxn } from 'shared/src/txn/run-txn'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const usersToReclaim: {
      balance: number
      username: string
      userId: string
    }[] = await pg.map(
      `SELECT
    u.id,
    u.username,
    (u.data->>'balance')::numeric AS balance
  FROM users u
  LEFT JOIN contract_bets cb ON u.id = cb.user_id
  WHERE
    ((u.data->>'lastBetTime') IS NULL OR to_timestamp(((u.data->>'lastBetTime')::numeric) / 1000.0) < '2024-01-01')
      and ((u.data->>'balance')::numeric) > 0.0
      and u.id NOT IN ('pyBueUg9y3hrDIUtrus5uAkPHCr1', 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2', 'tRZZ6ihugZQLXPf6aPRneGpWLmz1', 'ttl8PytdL4P9oD0fNneqvwgOZhy1')
  GROUP BY u.id, u.username, u.data
  HAVING COUNT(cb.user_id) < 10`,
      [],
      (r) => ({
        balance: Number(r.balance),
        username: r.username,
        userId: r.id,
      })
    )
    const balanceSum = sumBy(usersToReclaim, ({ balance }) =>
      Math.max(0, balance - 200)
    )
    console.log(
      'Users',
      usersToReclaim.length,
      'Total balance to reclaim:',
      balanceSum
    )

    const chunks = chunk(usersToReclaim, 25)
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (user) => {
          const { userId, balance, username } = user
          const didPurchaseMana = await pg.oneOrNone<boolean>(
            `select * from txns
        where
        category = 'MANA_PURCHASE'
        and to_id = $1
        limit 1`,
            [userId],
            (r) => !!r
          )
          const amountToReclaim = Math.max(0, balance - 200)
          console.log(
            'User:',
            username,
            'balance:',
            balance,
            'didPurchaseMana:',
            didPurchaseMana,
            'amountToReclaim:',
            amountToReclaim
          )

          if (!didPurchaseMana) {
            await firestore.runTransaction(async (txn) => {
              return runTxn(txn, {
                fromId: userId,
                fromType: 'USER',
                toId: 'BANK',
                toType: 'BANK',
                amount: amountToReclaim,
                category: 'RECLAIM_MANA',
                token: 'M$',
              })
            })
          }
        })
      )
    }
  })
}
