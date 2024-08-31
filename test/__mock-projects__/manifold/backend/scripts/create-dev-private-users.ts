import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { PrivateUser } from 'common/user'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { isProd } from 'shared/utils'

const firestore = admin.firestore()

async function main() {
  if (isProd())
    return console.log('This script is not allowed to run in production')
  const snap = await firestore.collection('private-users').get()
  const users = snap.docs.map((d) => d.data() as PrivateUser)

  await Promise.all(
    users.map(async (user) => {
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

        console.log('created private user for:', user.id)
      } catch (e) {
        console.log('error creating private user for:', user.id, e)
      }
    })
  )
}

if (require.main === module) main().then(() => process.exit())
