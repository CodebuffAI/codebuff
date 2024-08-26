import { initAdmin } from 'shared/init-admin'
initAdmin()
import * as admin from 'firebase-admin'

import { getAllPrivateUsers } from 'shared/utils'

const firestore = admin.firestore()

async function main() {
  const privateUsers = await getAllPrivateUsers()
  await Promise.all(
    privateUsers.map(async (privateUser) => {
      if (!privateUser || !privateUser.id) return
      return firestore
        .collection('private-users')
        .doc(privateUser.id)
        .update({
          ...privateUser,
          blockedByUserIds: [],
          blockedUserIds: [],
          blockedContractIds: [],
          blockedGroupSlugs: [],
        })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
