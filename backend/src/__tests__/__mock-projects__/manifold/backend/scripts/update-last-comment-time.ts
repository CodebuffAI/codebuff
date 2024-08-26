import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Contract } from 'common/contract'
import { getValues } from 'shared/utils'
import { Comment } from 'common/comment'

async function updateLastCommentTime() {
  const firestore = admin.firestore()
  console.log('Updating contracts lastCommentTime')

  const contracts = await getValues<Contract>(firestore.collection('contracts'))

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    const lastComments = await getValues<Comment>(
      contractRef.collection('comments').orderBy('createdTime', 'desc').limit(1)
    )

    if (lastComments.length > 0) {
      const lastCommentTime = lastComments[0].createdTime
      console.log(
        'Updating lastCommentTime',
        contract.question,
        lastCommentTime
      )

      await contractRef.update({
        lastCommentTime,
      } as Partial<Contract>)
    }
  }
}

if (require.main === module) {
  updateLastCommentTime().then(() => process.exit())
}
