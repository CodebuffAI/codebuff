import { writeFileSync } from 'fs'
import { initAdmin } from 'shared/init-admin'
initAdmin()
import { PrivateUser } from 'common/user'
import * as admin from 'firebase-admin'
import { getUser } from 'shared/utils'
import { DAY_MS } from 'common/util/time'

async function main() {
  const firestore = admin.firestore()
  const userSnap = await firestore
    .collection('private-users')
    .where('installedAppPlatforms', 'array-contains-any', ['ios', 'android'])
    .get()
  const privateUsers = userSnap.docs.map((doc) => doc.data() as PrivateUser)
  console.log('Loaded', privateUsers.length, 'users')
  const createdCutoff = Date.now() - 13 * DAY_MS
  const csv = await Promise.all(
    privateUsers.map(async (privateUser: PrivateUser) => {
      if (!privateUser.email) return ''
      const user = await getUser(privateUser.id)
      if (!user) return ''
      const lastBetTime = user.lastBetTime ?? 0
      const createdTime = user.createdTime
      if (lastBetTime > 0 || createdTime < createdCutoff) return ''
      return `${user.name}, ${privateUser.email},\n`
    })
  )
  csv.unshift('name, email\n')
  try {
    writeFileSync('app-user-emails.csv', csv.join(''))
  } catch (err) {
    console.error(err)
  }
}

if (require.main === module) main().then(() => process.exit())
