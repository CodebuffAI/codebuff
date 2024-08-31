import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()
import { getAllPrivateUsers, isProd } from 'shared/utils'
import {
  getDefaultNotificationPreferences,
  notification_preference,
} from 'common/user-notification-preferences'
import { filterDefined } from 'common/util/array'
import { chunk } from 'lodash'

const firestore = admin.firestore()

// Add your new pref here, and be sure to add the default as well
const NEW_PREFERENCE_KEY: notification_preference = 'new_match'

async function main() {
  const privateUsers = filterDefined(await getAllPrivateUsers())
  // const privateUsers = filterDefined([
  //   await getPrivateUser('AJwLWoo3xue32XIiAVrL5SyR1WB2'),
  // ])
  const defaults = getDefaultNotificationPreferences(!isProd())
  let count = 0
  const chunks = chunk(
    privateUsers.filter(
      (privateUser) =>
        privateUser.notificationPreferences?.[NEW_PREFERENCE_KEY] === undefined
    ),
    250
  )
  const total = chunks.length * 250
  console.log('Updating', total, 'users')
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (privateUser) => {
        if (!privateUser.id) return
        const currentUserPreferences = privateUser.notificationPreferences
          ? privateUser.notificationPreferences
          : defaults
        try {
          await firestore
            .collection('private-users')
            .doc(privateUser.id)
            .update({
              notificationPreferences: {
                ...currentUserPreferences,
                [NEW_PREFERENCE_KEY]: defaults[NEW_PREFERENCE_KEY],
              },
            })
        } catch (e) {
          console.log(e)
          console.log('Error updating user', privateUser.id)
        }
        count++
        if (count % 100 === 0) console.log('Updated', count, 'users of', total)
      })
    )
  }
}

if (require.main === module) main().then(() => process.exit())
