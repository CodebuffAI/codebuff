import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { getValues } from 'shared/utils'
import { Contract } from 'common/contract'
import { Comment } from 'common/comment'
import { uniq } from 'lodash'
import { Bet } from 'common/bet'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

const firestore = admin.firestore()

async function backfillContractFollowers() {
  console.log('Backfilling contract followers')
  const contracts = await getValues<Contract>(
    firestore.collection('contracts').where('isResolved', '==', false)
  )
  let count = 0
  for (const contract of contracts) {
    const comments = await getValues<Comment>(
      firestore.collection('contracts').doc(contract.id).collection('comments')
    )
    const commenterIds = uniq(comments.map((comment) => comment.userId))
    const betsSnap = await firestore
      .collection(`contracts/${contract.id}/bets`)
      .get()
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    // filter bets for only users that have an amount invested still
    const bettorIds = uniq(bets.map((bet) => bet.userId))
    const liquidityProviders = await firestore
      .collection(`contracts/${contract.id}/liquidity`)
      .get()
    const liquidityProvidersIds = uniq(
      liquidityProviders.docs.map((doc) => doc.data().userId)
      // exclude free market liquidity provider
    ).filter(
      (id) =>
        id !== HOUSE_LIQUIDITY_PROVIDER_ID ||
        id !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID
    )
    const followerIds = uniq([
      ...commenterIds,
      ...bettorIds,
      ...liquidityProvidersIds,
      contract.creatorId,
    ])
    for (const followerId of followerIds) {
      await firestore
        .collection(`contracts/${contract.id}/follows`)
        .doc(followerId)
        .set({ id: followerId, createdTime: Date.now() })
    }

    count += 1
    if (count % 100 === 0) {
      console.log(`${count} contracts processed`)
    }
  }
}

if (require.main === module) {
  backfillContractFollowers()
    .then(() => process.exit())
    .catch(console.log)
}
