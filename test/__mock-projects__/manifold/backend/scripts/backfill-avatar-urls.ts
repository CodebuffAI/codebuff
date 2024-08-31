import { initAdmin } from 'shared/init-admin'
initAdmin()
import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { generateAndUpdateAvatarUrls } from 'shared/helpers/generate-and-update-avatar-urls'

const firestore = admin.firestore()
async function backfillAvatarUrls() {
  const userDocs = await firestore.collection('users').get()
  const users = userDocs.docs.map((doc) => doc.data() as User)
  const usersWithNoAvatarUrl = users.filter((user) => !user.avatarUrl)
  console.log(`Found ${usersWithNoAvatarUrl.length} users with no avatarUrl.`)
  await generateAndUpdateAvatarUrls(usersWithNoAvatarUrl)
}

if (require.main === module) backfillAvatarUrls().then(() => process.exit())
