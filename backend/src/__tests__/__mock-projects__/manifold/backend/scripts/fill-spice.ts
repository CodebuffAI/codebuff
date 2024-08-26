import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const users = await firestore.collection('users').get()

    for (const user of users.docs) {
      if (user.data().spiceBalance == null) {
        await user.ref.update({ spiceBalance: 0 })
      }
    }
  })
}
