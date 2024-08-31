import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()
import { getAllPrivateUsers } from 'shared/utils'
import { chunk, uniq } from 'lodash'
import {
  notification_destination_types,
  notification_preference,
} from 'common/user-notification-preferences'

const key: notification_preference = 'new_love_ship'
const destinationToAdd: notification_destination_types = 'browser'
// const key: notification_preference = 'new_love_like'
// const destinationToAdd: notification_destination_types = 'browser'

async function main() {
  const firestore = admin.firestore()
  const privateUsers = await getAllPrivateUsers()
  // const privateUsers = filterDefined([
  //   await getPrivateUser('AJwLWoo3xue32XIiAVrL5SyR1WB2'),
  // ])
  // filter out users who have already opted in for this destination and type
  const privateUsersToOptIn = privateUsers.filter((privateUser) => {
    if (!privateUser.id) return false
    const previousPrefsForKey = privateUser.notificationPreferences[key] ?? []
    return !previousPrefsForKey.includes(destinationToAdd)
  })
  console.log(
    `Opting in ${privateUsersToOptIn.length} users to ${destinationToAdd} ${key} notifications`
  )
  const chunks = chunk(privateUsersToOptIn, 500)
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map((privateUser) => {
        if (!privateUser.id) return
        const previousPrefs = privateUser.notificationPreferences[key] ?? []
        return firestore
          .collection('private-users')
          .doc(privateUser.id)
          .update({
            notificationPreferences: {
              ...privateUser.notificationPreferences,
              [key]: uniq([
                ...previousPrefs,
                destinationToAdd,
              ]) as notification_destination_types[],
            },
          })
      })
    )
  }
}

if (require.main === module) main().then(() => process.exit())
