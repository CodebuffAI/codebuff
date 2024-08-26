import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
import { getValues } from 'shared/utils'
import { FieldValue } from 'firebase-admin/firestore'
import { User } from 'common/user'

initAdmin()

const firestore = admin.firestore()

async function main() {
  const collection = 'private-users'
  const users = await getValues<User>(firestore.collection(collection))
  await Promise.all(
    users.map(async (user) => {
      await firestore.collection(collection).doc(user.id).update({
        username: FieldValue.delete(),
      })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
