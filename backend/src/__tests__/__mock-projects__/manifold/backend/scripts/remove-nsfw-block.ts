import { runScript } from './run-script'
import { PrivateUser } from 'common/user'

if (require.main === module) {
  runScript(async ({ firestore, pg }) => {
    const users = await firestore
      .collection('private-users')
      .where('blockedGroupSlugs', 'array-contains', 'nsfw')
      .get()
    const privateUsers = users.docs.map((doc) => doc.data() as PrivateUser)
    const recentlyCreatedUserIds = await pg.map(
      `select id from users where millis_to_ts(((data->'createdTime')::bigint)) > now() - interval '30 day'`,
      [],
      (row) => row.id
    )
    const recentlyCreatedPrivateUsers = privateUsers.filter(
      (privateUser) =>
        recentlyCreatedUserIds.includes(privateUser.id) &&
        // Only clear nsfw if that's the only group they've blocked
        privateUser.blockedGroupSlugs.length === 1
    )
    console.log(
      'clearing nsfw for',
      recentlyCreatedPrivateUsers.length,
      'users'
    )
    await Promise.all(
      recentlyCreatedPrivateUsers.map(async (privateUser) => {
        if (!privateUser || !privateUser.id) return
        return firestore
          .collection('private-users')
          .doc(privateUser.id)
          .update({
            ...privateUser,
            blockedGroupSlugs: [],
          })
      })
    )
  })
}
