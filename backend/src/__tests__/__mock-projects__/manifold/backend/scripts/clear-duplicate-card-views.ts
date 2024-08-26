import * as admin from 'firebase-admin'
import { Query } from 'firebase-admin/firestore'
import { uniq, sortBy } from 'lodash'
import { initAdmin } from 'shared/init-admin'
initAdmin()

import { mapAsync } from 'common/util/promise'
import { loadPaginated } from 'shared/utils'

const firestore = admin.firestore()

const clearDuplicateCardViews = async () => {
  console.log('Clearing card view events except the most recent one.')

  const userIds = (
    await loadPaginated(
      firestore.collection('users').select('id') as Query<{ id: string }>
    )
  ).map(({ id }) => id)

  console.log('Loaded', userIds.length, 'users')

  await mapAsync(
    userIds,
    async (userId) => {
      const viewedCardsSnapshot = await (
        firestore
          .collection('users')
          .doc(userId)
          .collection('events')
          .where('name', '==', 'view market card')
          .select('contractId', 'timestamp') as Query<{
          contractId: string
          timestamp: number
        }>
      ).get()

      const viewEvents = viewedCardsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }))
      const contractIds = uniq(viewEvents.map(({ contractId }) => contractId))

      for (const contractId of contractIds) {
        const contractEvents = viewEvents.filter(
          (event) => event.contractId === contractId
        )
        const sortedEvents = sortBy(contractEvents, 'timestamp').reverse()
        const eventsToDelete = sortedEvents.slice(1)
        if (eventsToDelete.length > 0)
          console.log('eventsToDelete', eventsToDelete.length)

        for (const event of eventsToDelete) {
          await firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .doc(event.id)
            .delete()
        }
      }
    },
    10
  )
}

if (require.main === module) {
  clearDuplicateCardViews().then(() => process.exit())
}
