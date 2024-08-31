import { sumBy } from 'lodash'
import { runScript } from 'run-script'
import { createExtraPurchasedManaNotification } from 'shared/create-notification'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { getUser } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const netPurchases = await pg.map(
      `
        select tp.to_id as user_id,
              users.username,
              sum(tp.amount) as purchased, 
              sum(coalesce(tc.amount, 0)) as donated, 
              sum(coalesce(tm.amount, 0)) as mana_payment,
              sum(tp.amount - coalesce(tc.amount, 0) - coalesce(tm.amount, 0)) as net_purchased
        from txns tp
        left join txns tc on tp.to_id = tc.from_id
                        and tc.category = 'CHARITY'
                        and tc.created_time > '2024-01-01'
        left join txns tm on tp.to_id = tm.from_id
                        and tm.category = 'MANA_PAYMENT'
                        and tm.created_time > '2024-01-01'
                        and (tm.to_id = 'ttl8PytdL4P9oD0fNneqvwgOZhy1' or
                          tm.to_id = 'pyBueUg9y3hrDIUtrus5uAkPHCr1')
        join users on tp.to_id = users.id
        where tp.category = 'MANA_PURCHASE'
          and tp.created_time > '2024-01-01'
          and tp.created_time < '2024-05-16 18:20:00'
          and (users.data->>'isBannedFromPosting' is null or users.data->>'isBannedFromPosting' = 'false')
        group by tp.to_id, users.username
        having sum(tp.amount - coalesce(tc.amount, 0) - coalesce(tm.amount, 0)) > 0
        order by net_purchased desc
    `,
      [],
      (r) => ({
        userId: r.user_id as string,
        username: r.username as string,
        amount: Number(r.net_purchased),
      })
    )

    const excludedUsernames = [
      'AmmonLam',
      'ManifoldPolitics',
      'JoelBecker',
      'GavrielK',
    ]
    const netPurchasesWithExclusions = netPurchases.filter(
      (np) => !excludedUsernames.includes(np.username)
    )

    console.log('Net purchases', netPurchasesWithExclusions)
    console.log(
      'Sum',
      sumBy(netPurchasesWithExclusions, (np) => np.amount * 9)
    )

    await pg.tx(async (tx) => {
      for (const { userId, username, amount } of netPurchasesWithExclusions) {
        const awardedAmount = amount * 9
        console.log('Awarding to user', username, 'amount', awardedAmount)
        const user = await getUser(userId)
        if (user)
          await createExtraPurchasedManaNotification(
            user,
            `extra-purchased-mana-${userId}`,
            awardedAmount
          )
        await runTxnFromBank(tx, {
          fromType: 'BANK',
          toType: 'USER',
          toId: userId,
          amount: awardedAmount,
          category: 'EXTRA_PURCHASED_MANA',
          token: 'M$',
          description:
            '9x your purchased mana in 2024 minus donations and some mana payments',
        })
      }
    })
  })
}
