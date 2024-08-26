import { runScript } from './run-script'
import { runTxn } from 'shared/src/txn/run-txn'
import { ReclaimManaTxn } from 'common/src/txn'
import { convertTxn } from 'common/supabase/txns'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    // const usernamesToNotUndo = [
    //   'BetonLove',
    //   'ManifoldBugs',
    //   'VersusBot',
    //   'manifoldtestnewuserc32ebf',
    //   'ManifoldDream',
    //   'honey', // already undid reclaim
    // ]
    const usersToUndoReclaim = await pg.manyOrNone(`
    select from_id, username from txns
    join users on users.id = txns.from_id
    where
      category ='RECLAIM_MANA'
      and amount < 1500
      and amount > 0
      and (users.data->'creatorTraders'->>'allTime')::numeric > 0
    order by amount desc`)
    console.log(
      'usernames to undo reclaim:',
      usersToUndoReclaim.map(({ username }) => username)
    )
    const usersIdsToUndoReclaim = usersToUndoReclaim.map(
      ({ from_id }) => from_id as string
    )
    const reclaimTxns = await pg.map(
      `SELECT * FROM txns
      WHERE
      from_id IN ($1:list)
      AND category = 'RECLAIM_MANA'`,
      [usersIdsToUndoReclaim],
      (r) => convertTxn(r) as ReclaimManaTxn
    )

    for (const reclaimTxn of reclaimTxns) {
      const hasNegativeTxn = await pg.oneOrNone(
        `SELECT * FROM txns
        WHERE from_id = $1
          AND category = 'RECLAIM_MANA'
          AND amount < 0
        limit 1`,
        [reclaimTxn.fromId]
      )
      if (hasNegativeTxn) {
        console.log('has negative txn', hasNegativeTxn, reclaimTxn)
        continue
      }

      const { amount, fromId } = reclaimTxn
      const result = await firestore.runTransaction(async (txn) => {
        return runTxn(txn, {
          fromId,
          fromType: 'USER',
          toId: 'BANK',
          toType: 'BANK',
          amount: -amount,
          category: 'RECLAIM_MANA',
          token: 'M$',
        })
      })
      console.log('Result:', result)
    }
  })
}
