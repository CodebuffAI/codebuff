import { writeFileSync } from 'fs'
import { initAdmin } from 'shared/init-admin'
initAdmin()
import { User } from 'common/user'
import { getPrivateUser } from 'shared/utils'
import * as admin from 'firebase-admin'
import { DAY_MS } from 'common/util/time'

async function main() {
  const firestore = admin.firestore()
  // Last run on 4/18/2023
  const usersSnap = await firestore
    .collection('users')
    .where('createdTime', '>=', Date.now() - 12 * DAY_MS)
    .get()
  const users = usersSnap.docs.map((doc) => doc.data() as User)

  console.log('Loaded', users.length, 'users')
  const csv = await Promise.all(
    users.map(async (user: User) => {
      const privateUser = await getPrivateUser(user.id)
      if (!privateUser || !privateUser.email) return ''
      return `${privateUser.email},\n`
    })
  )
  try {
    csv.unshift('email\n')
    writeFileSync('new-user-emails.csv', csv.join(''))
  } catch (err) {
    console.error(err)
  }
}

if (require.main === module) main().then(() => process.exit())
