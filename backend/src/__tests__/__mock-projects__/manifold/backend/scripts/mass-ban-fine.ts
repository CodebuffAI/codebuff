import { initAdmin } from 'shared/init-admin'
initAdmin()
import * as admin from 'firebase-admin'

const firestore = admin.firestore()

const initialIpAddress = process.argv[2]
const fineAmount = parseFloat(process.argv[3])

if (!initialIpAddress || isNaN(fineAmount)) {
  console.error('Please provide initialIpAddress and fineAmount as arguments.')
  process.exit(1)
}

async function banAndFineUsers() {
  const snap = await firestore
    .collection('private-users')
    .where('initialIpAddress', '==', initialIpAddress)
    .get()

  const users = snap.docs.map((doc) => doc.data())

  for (const user of users) {
    console.log('Banning and fining user:', user.id)

    await firestore
      .collection('users')
      .doc(user.id)
      .update({
        isBannedFromPosting: true,
        balance: admin.firestore.FieldValue.increment(-fineAmount),
      })
  }
}

if (require.main === module) banAndFineUsers().then(() => process.exit())
