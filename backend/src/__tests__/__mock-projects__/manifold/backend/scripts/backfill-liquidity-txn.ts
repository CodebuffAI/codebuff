import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { LiquidityProvision } from 'common/liquidity-provision'
import { removeUndefinedProps } from 'common/util/object'
import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ db, pg, firestore }) => {
    // get all liquidity documents
    const liquiditySnap = await firestore.collectionGroup('liquidity').get()
    const liquidityDocs = liquiditySnap.docs.map(
      (doc) => doc.data() as LiquidityProvision
    )

    const liquidityTxns = liquidityDocs
      .filter((l) => !l.isAnte)
      .map((l) => {
        const isBank =
          l.userId === HOUSE_LIQUIDITY_PROVIDER_ID ||
          l.userId === DEV_HOUSE_LIQUIDITY_PROVIDER_ID

        if (l.isAnte) {
          return {
            fromType: isBank ? 'BANK' : 'USER',
            fromId: l.userId,
            amount: l.amount,
            toType: 'CONTRACT',
            toId: l.contractId,
            category: 'ANTE',
            token: 'ANTE',
            createdTime: l.createdTime,
            data: removeUndefinedProps({
              answerId: l.answerId,
              isAnte: l.isAnte,
              // pool: doc.pool,
            }),
          }
        }

        return {
          fromType: isBank ? 'BANK' : 'USER',
          fromId: l.userId,
          amount: l.amount,
          toType: 'CONTRACT',
          toId: l.contractId,
          category: 'ADD_SUBSIDY',
          token: 'M$',
          createdTime: l.createdTime,
          data: removeUndefinedProps({
            answerId: l.answerId,
            isAnte: l.isAnte,
            // pool: doc.pool,
          }),
        }
      })
  })
  //
}
