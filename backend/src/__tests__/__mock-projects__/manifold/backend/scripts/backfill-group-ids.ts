// We have some groups without IDs. Let's fill them in.

import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const groupsQuery = firestore.collection('groups')
  groupsQuery.get().then(async (groupSnaps) => {
    log(`Loaded ${groupSnaps.size} groups.`)
    const needsFilling = groupSnaps.docs.filter((ct) => {
      return !('id' in ct.data())
    })
    log(`${needsFilling.length} groups need IDs.`)
    const updates = needsFilling.map((group) => {
      return { doc: group.ref, fields: { id: group.id } }
    })
    log(`Updating ${updates.length} groups.`)
    await writeAsync(firestore, updates)
    log(`Updated all groups.`)
  })
}
