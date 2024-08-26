// Filling in the contract-based fields on comments.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { findDiffs, describeDiff, applyDiff } from './denormalize'
import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'

initAdmin()
const firestore = admin.firestore()

async function getContractsById(transaction: Transaction) {
  const contracts = await transaction.get(firestore.collection('contracts'))
  const results = Object.fromEntries(contracts.docs.map((doc) => [doc.id, doc]))
  console.log(`Found ${contracts.size} contracts.`)
  return results
}

async function getCommentsByContractId(transaction: Transaction) {
  const comments = await transaction.get(
    firestore.collectionGroup('comments').where('contractId', '!=', null)
  )
  const results = new Map<string, DocumentSnapshot[]>()
  comments.forEach((doc) => {
    const contractId = doc.get('contractId')
    const contractComments = results.get(contractId) || []
    contractComments.push(doc)
    results.set(contractId, contractComments)
  })
  console.log(`Found ${comments.size} comments on ${results.size} contracts.`)
  return results
}

async function denormalize() {
  let hasMore = true
  while (hasMore) {
    hasMore = await admin.firestore().runTransaction(async (transaction) => {
      const [contractsById, commentsByContractId] = await Promise.all([
        getContractsById(transaction),
        getCommentsByContractId(transaction),
      ])
      const mapping = Object.entries(contractsById).map(([id, doc]) => {
        return [doc, commentsByContractId.get(id) || []] as const
      })
      const diffs = findDiffs(
        mapping,
        ['slug', 'contractSlug'],
        ['question', 'contractQuestion']
      )
      console.log(`Found ${diffs.length} comments with mismatched data.`)
      diffs.slice(0, 500).forEach((d) => {
        console.log(describeDiff(d))
        applyDiff(transaction, d)
      })
      if (diffs.length > 500) {
        console.log(`Applying first 500 because of Firestore limit...`)
      }
      return diffs.length > 500
    })
  }
}

if (require.main === module) {
  denormalize().catch((e) => console.error(e))
}
