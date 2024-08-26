// We have many old contracts without a collectedFees data structure. Let's fill them in.

import { MarketContract } from 'common/contract'
import { getTierFromLiquidity } from 'common/tier'
import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const contractsRef = firestore.collection('contracts')
  contractsRef.get().then(async (contractsSnaps) => {
    console.log(`Loaded ${contractsSnaps.size} contracts.`)
    const needsFilling = contractsSnaps.docs.filter((ct) => {
      return (
        !('marketTier' in ct.data()) &&
        'totalLiquidity' in ct.data()
      )
    })
    console.log(`Found ${needsFilling.length} contracts to update.`)
    await Promise.all(
      needsFilling.map((ct) => {
        ct.ref.update({
          marketTier: getTierFromLiquidity(
            ct.data() as MarketContract,
            ct.data().totalLiquidity
          ),
        })
        console.log(ct.data().marketTier, ct.data().totalLiquidity)
      })
    )
    console.log(`Updated all contracts.`)
  })
}
