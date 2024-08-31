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
    const shouldCheck = contractsSnaps.docs.filter((ct) => {
      return 'totalLiquidity' in ct.data() && ct.data().isResolved
    })
    console.log(`Found ${shouldCheck.length} contracts to check.`)
    await Promise.all(
      shouldCheck.map((ct) => {
        console.log(ct.data().marketTier, ct.data().totalLiquidity)
        if (ct.data().answers) {
          console.log(ct.data().answers.length)
        }
      })
    )
    console.log(`Checked all contracts`)
  })
}
