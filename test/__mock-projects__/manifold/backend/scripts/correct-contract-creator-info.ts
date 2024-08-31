import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { getAllUsers, getValues } from 'shared/utils'
import { Contract } from 'common/contract'
import { Comment } from 'common/comment'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'

const firestore = admin.firestore()

// If the snapshot gets too old, do one group at a time
async function correctContractCreatorInfo() {
  const users = await getAllUsers()

  await Promise.all(
    users.map(async (user) => {
      const contracts = await getValues<Contract>(
        firestore.collection('contracts').where('creatorId', '==', user.id)
      )
      await Promise.all(
        contracts.map(async (contract) => {
          if (
            contract.creatorUsername !== user.username ||
            contract.creatorName !== user.name ||
            contract.creatorAvatarUrl !== user.avatarUrl
          ) {
            console.log(`Updating contract ${contract.id} creator info`)
            await firestore.collection('contracts').doc(contract.id).update({
              creatorUsername: user.username,
              creatorName: user.name,
              creatorAvatarUrl: user.avatarUrl,
            })
          }
        })
      )

      const betsSnap = await firestore
        .collectionGroup('bets')
        .where('userId', '==', user.id)
        .get()

      await Promise.all(
        betsSnap.docs.map(async (doc) => {
          const bet = doc.data() as Bet
          if (
            (bet.userUsername !== user.username ||
              bet.userName !== user.name ||
              bet.userAvatarUrl !== user.avatarUrl) &&
            bet.createdTime > 1654041600000
          ) {
            console.log(
              `Updating bet ${doc.id} on contract ${bet.contractId} creator info`
            )
            await doc.ref.update({
              userUsername: user.username,
              userName: user.name,
              userAvatarUrl: user.avatarUrl,
            })
          }
        })
      )

      const answerSnap = await firestore
        .collectionGroup('answers')
        .where('userId', '==', user.id)
        .get()
      await Promise.all(
        answerSnap.docs.map(async (doc) => {
          const answer = doc.data() as Answer
          if (
            answer.username !== user.username ||
            answer.name !== user.name ||
            answer.avatarUrl !== user.avatarUrl
          ) {
            console.log(
              `Updating answer ${doc.id} on contract ${answer.contractId} creator info`
            )
            await doc.ref.update({
              username: user.username,
              name: user.name,
              avatarUrl: user.avatarUrl,
            })
          }
        })
      )

      // do the same for comments, answers, and bets
      const commentSnap = await firestore
        .collectionGroup('comments')
        .where('userId', '==', user.id)
        .get()

      await Promise.all(
        commentSnap.docs.map(async (doc) => {
          const comment = doc.data() as Comment
          if (
            comment.userUsername !== user.username ||
            comment.userName !== user.name ||
            comment.userAvatarUrl !== user.avatarUrl
          ) {
            console.log(`Updating comment ${doc.id} creator info`)
            await doc.ref.update({
              userUsername: user.username,
              userName: user.name,
              userAvatarUrl: user.avatarUrl,
            })
          }
        })
      )
    })
  )
}

if (require.main === module) {
  correctContractCreatorInfo()
    .then(() => process.exit())
    .catch(console.log)
}
