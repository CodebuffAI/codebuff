import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { PrivateUser, User } from 'common/user'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { getAllUsers, isProd } from 'shared/utils'
import { mapAsync } from 'common/lib/util/promise'
import { FieldValue } from 'firebase-admin/lib/firestore'

const firestore = admin.firestore()
// Run export FIRESTORE_EMULATOR_HOST="localhost:8080" in the terminal before running this script
async function main() {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (host !== 'localhost:8080')
    return console.log(
      'This script must be run on the local emulator, run export FIRESTORE_EMULATOR_HOST="localhost:8080" in the terminal before running this script'
    )
  if (isProd())
    return console.log('This script is not allowed to run in production')

  await cleanPrivateUsers()
  await cleanUsersEmails()
  // await deleteTopLevelCollections()
  // await deleteUsersSubcollections()
  // await deleteOldContracts()
  return console.log('done')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deleteTopLevelCollections() {
  const deleteCollections = [
    'certs',
    'folds',
    'manalinks',
    'stripe-transactions',
    'transactions',
    'groupMembers',
  ]
  await Promise.all(
    deleteCollections.map(async (collection) => {
      return deleteCollection(firestore, collection, 500)
    })
  )
}

//  Note for next time: this was failing to delete collection on some users,
//  but in the end I used an old, smaller firestore export and using this wasn't necessary.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deleteUsersSubcollections() {
  const deleteSubCollections = ['contract-metrics', 'notifications', 'events']
  const userSnap = await firestore.collection('users').get()
  const users = userSnap.docs.map((d) => d.data() as User)
  const usersToDelete = users.filter(
    (u) => u.balance === 1000 || u.balance < 300
  )
  const userIds = usersToDelete.map((d) => d.id)
  console.log('deleting users subcollections:', userIds.length)
  await Promise.all(
    userIds.map(async (id) => {
      await Promise.all(
        deleteSubCollections.map(async (collection) => {
          console.log('deleted user subcollections:', id, collection)
          return deleteCollection(firestore, `users/${id}/${collection}`, 500)
        })
      )
    })
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deleteOldContracts() {
  // delete contracts made older than 1 month
  const thresholdPeriod = Date.now() - 1000 * 60 * 60 * 24 * 30
  const contractSnap = await firestore
    .collection('contracts')
    .where('createdTime', '<', thresholdPeriod)
    .get()
  const contractIds = contractSnap.docs.map((d) => d.id)
  console.log('deleting contracts:', contractIds.length)
  await Promise.all(
    contractIds.map(async (id) => {
      try {
        // delete bets, follows, liquidity, comments subcollections
        const subcollections = [
          'bets',
          'follows',
          'liquidity',
          'comments',
          'answers',
          'challenges',
        ]
        await Promise.all(
          subcollections.map(async (subcollection) => {
            return deleteCollection(
              firestore,
              `contracts/${id}/${subcollection}`,
              500
            )
          })
        )
        await firestore.collection('contracts').doc(id).delete()
        console.log('deleted contract:', id)
      } catch (e) {
        console.log('error deleting contract:', id, e)
      }
    })
  )
}

async function cleanPrivateUsers() {
  const snap = await firestore.collection('private-users').get()
  const users = snap.docs.map((d) => d.data() as PrivateUser)

  await Promise.all(
    users.map(async (user) => {
      if (!user || !user.id) return
      const privateUser: PrivateUser = {
        id: user.id,
        notificationPreferences: getDefaultNotificationPreferences(true),
        blockedUserIds: [],
        blockedByUserIds: [],
        blockedContractIds: [],
        blockedGroupSlugs: [],
      }
      try {
        await firestore
          .collection('private-users')
          .doc(user.id)
          .set(privateUser)
      } catch (e) {
        console.log('error creating private user for:', user.id, e)
      }
    })
  )
}

async function cleanUsersEmails() {
  const users = await getAllUsers()
  console.log('Loaded', users.length, 'users')

  await mapAsync(users, async (user) => {
    const u = user as any
    if (!u.email) return

    console.log('delete email for', u.id, u.email)
    await firestore.collection('users').doc(user.id).update({
      email: FieldValue.delete(),
    })
  })
}

async function deleteCollection(
  db: any,
  collectionPath: string,
  batchSize: number
) {
  const collectionRef = db.collection(collectionPath)
  const query = collectionRef.orderBy('__name__').limit(batchSize)

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject)
  })
}

async function deleteQueryBatch(db: any, query: any, resolve: any) {
  const snapshot = await query.get()

  const batchSize = snapshot.size
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve()
    return
  }

  // Delete documents in a batch
  const batch = db.batch()
  snapshot.docs.forEach((doc: any) => {
    batch.delete(doc.ref)
  })
  await batch.commit()

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve)
  })
}

if (require.main === module) main().then(() => process.exit())
