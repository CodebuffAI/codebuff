import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Contract } from 'common/contract'
import { payUser } from 'shared/utils'

const firestore = admin.firestore()

async function refundCommentBounties() {
  const snapshot = await firestore
    .collection('contracts')
    .where('openCommentBounties', '>=', 0)
    .get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')
  await Promise.all(
    contracts.map(async (contract) => {
      const contractRef = firestore.doc(`contracts/${contract.id}`)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const bounty = contract.openCommentBounties
      if (bounty > 0) await payUser(contract.creatorId, bounty, true)

      console.log(
        'Updating',
        contract.slug + ' with ' + bounty + ' open bounties'
      )
      await contractRef.update({
        openCommentBounties: admin.firestore.FieldValue.delete(),
      })
    })
  )
}

if (require.main === module) {
  refundCommentBounties().catch((e) => console.error(e))
}
