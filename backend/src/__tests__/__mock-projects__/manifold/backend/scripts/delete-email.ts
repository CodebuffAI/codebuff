import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()
import { FieldValue } from 'firebase-admin/firestore'
import { getAllUsers } from 'shared/utils'
import { mapAsync } from 'common/util/promise'

const firestore = admin.firestore()

async function main() {
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

if (require.main === module) main().then(() => process.exit())
