import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { PrivateUser, User } from 'common/user'
import { STARTING_BALANCE } from 'common/economy'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'

const firestore = admin.firestore()

async function main() {
  const snap = await firestore.collection('users').get()
  const users = snap.docs.map((d) => d.data() as User)

  for (const user of users) {
    const fbUser = await admin.auth().getUser(user.id)
    const email = fbUser.email
    const privateUser: PrivateUser = {
      id: user.id,
      email,
      notificationPreferences: getDefaultNotificationPreferences(),
      blockedUserIds: [],
      blockedByUserIds: [],
      blockedContractIds: [],
      blockedGroupSlugs: [],
    }

    if (user.totalDeposits === undefined) {
      await firestore
        .collection('users')
        .doc(user.id)
        .update({ totalDeposits: STARTING_BALANCE })

      console.log('set starting balance for:', user.username)
    }

    try {
      await firestore
        .collection('private-users')
        .doc(user.id)
        .create(privateUser)

      console.log('created private user for:', user.username)
    } catch (_) {
      // private user already created
    }
  }
}

if (require.main === module) main().then(() => process.exit())
