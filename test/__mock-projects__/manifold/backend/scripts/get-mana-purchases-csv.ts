import { runScript } from 'run-script'
import { writeCsv } from 'shared/helpers/file'
import { getPrivateUser } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const purchasesByUser = await pg.map(
      `
        select tp.to_id as user_id,
              users.username,
              sum(tp.amount) as amount, 
              max(tp.created_time) as last_purchase
        from txns tp
        join users on tp.to_id = users.id
        where tp.category = 'MANA_PURCHASE'
          and (users.data->>'isBannedFromPosting' is null or users.data->>'isBannedFromPosting' = 'false')
          and tp.created_time > '2024-05-16 18:20:00'
        group by tp.to_id, users.username
        order by amount desc
    `,
      [],
      (r) => ({
        userId: r.user_id as string,
        username: r.username as string,
        amount: String(r.amount),
        last_purchase: r.last_purchase as string,
      })
    )

    const privateUsers = await Promise.all(
      purchasesByUser.map((p) => getPrivateUser(p.userId))
    )
    const data = purchasesByUser.map((np, i) => ({
      ...np,
      email: privateUsers[i]?.email ?? '',
    }))

    await writeCsv(
      'mana-purchases-post-pivot.csv',
      ['username', 'userId', 'amount', 'last_purchase', 'email'],
      data,
      ','
    )
  })
}
