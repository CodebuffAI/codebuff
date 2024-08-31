import { runScript } from 'run-script'
import { runTxnFromBank } from 'shared/txn/run-txn'

if (require.main === module) {
  runScript(async ({ pg }) => {
    await pg.tx(async (tx) => {
      await runTxnFromBank(tx, {
        amount: 2_000_000,
        description: 'Top up Manifold account',
        category: 'MANIFOLD_TOP_UP',
        fromType: 'BANK',
        toType: 'USER',
        toId: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2', // Manifold account user id
        token: 'M$',
      })
    })
  })
}
