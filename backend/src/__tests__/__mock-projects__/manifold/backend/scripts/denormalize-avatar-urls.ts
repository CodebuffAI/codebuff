// Script for lining up users and contracts/comments to make sure the denormalized avatar URLs in the contracts and
// comments match the user avatar URLs.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { findDiffs, describeDiff, applyDiff } from './denormalize'
import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'

initAdmin()
const firestore = admin.firestore()

async function getUsersById(transaction: Transaction) {
  const results = new Map<string, DocumentSnapshot>()
  const users = await transaction.get(firestore.collection('users'))
  users.forEach((doc) => {
    results.set(doc.get('id'), doc)
  })
  console.log(`Found ${results.size} unique users.`)
  return results
}

async function getContractsByUserId(transaction: Transaction) {
  let n = 0
  const results = new Map<string, DocumentSnapshot[]>()
  const contracts = await transaction.get(firestore.collection('contracts'))
  contracts.forEach((doc) => {
    const creatorId = doc.get('creatorId')
    const creatorContracts = results.get(creatorId) || []
    creatorContracts.push(doc)
    results.set(creatorId, creatorContracts)
    n++
  })
  console.log(`Found ${n} contracts from ${results.size} unique users.`)
  return results
}

async function getCommentsByUserId(transaction: Transaction) {
  let n = 0
  const results = new Map<string, DocumentSnapshot[]>()
  const comments = await transaction.get(firestore.collectionGroup('comments'))
  comments.forEach((doc) => {
    const userId = doc.get('userId')
    const userComments = results.get(userId) || []
    userComments.push(doc)
    results.set(userId, userComments)
    n++
  })
  console.log(`Found ${n} comments from ${results.size} unique users.`)
  return results
}

async function getAnswersByUserId(transaction: Transaction) {
  let n = 0
  const results = new Map<string, DocumentSnapshot[]>()
  const answers = await transaction.get(firestore.collectionGroup('answers'))
  answers.forEach((doc) => {
    const userId = doc.get('userId')
    const userAnswers = results.get(userId) || []
    userAnswers.push(doc)
    results.set(userId, userAnswers)
    n++
  })
  console.log(`Found ${n} answers from ${results.size} unique users.`)
  return results
}

if (require.main === module) {
  admin.firestore().runTransaction(async (transaction) => {
    const [usersById, contractsByUserId, commentsByUserId, answersByUserId] =
      await Promise.all([
        getUsersById(transaction),
        getContractsByUserId(transaction),
        getCommentsByUserId(transaction),
        getAnswersByUserId(transaction),
      ])

    const usersContracts = Array.from(usersById.entries(), ([id, doc]) => {
      return [doc, contractsByUserId.get(id) || []] as const
    })
    const contractDiffs = findDiffs(usersContracts, [
      'avatarUrl',
      'creatorAvatarUrl',
    ])
    console.log(`Found ${contractDiffs.length} contracts with mismatches.`)
    contractDiffs.forEach((d) => {
      console.log(describeDiff(d))
      applyDiff(transaction, d)
    })

    const usersComments = Array.from(usersById.entries(), ([id, doc]) => {
      return [doc, commentsByUserId.get(id) || []] as const
    })
    const commentDiffs = findDiffs(usersComments, [
      'avatarUrl',
      'userAvatarUrl',
    ])
    console.log(`Found ${commentDiffs.length} comments with mismatches.`)
    commentDiffs.forEach((d) => {
      console.log(describeDiff(d))
      applyDiff(transaction, d)
    })

    const usersAnswers = Array.from(usersById.entries(), ([id, doc]) => {
      return [doc, answersByUserId.get(id) || []] as const
    })
    const answerDiffs = findDiffs(usersAnswers, ['avatarUrl', 'avatarUrl'])
    console.log(`Found ${answerDiffs.length} answers with mismatches.`)
    answerDiffs.forEach((d) => {
      console.log(describeDiff(d))
      applyDiff(transaction, d)
    })
  })
}
