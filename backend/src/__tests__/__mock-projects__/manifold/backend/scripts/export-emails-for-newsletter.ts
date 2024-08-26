import * as admin from 'firebase-admin'
import * as fs from 'fs'
import { Parser } from 'json2csv'

import { initAdmin } from 'shared/init-admin'

initAdmin()

const firestore = admin.firestore()
const [outputDir] = process.argv.slice(2)
const outputPath = `${outputDir}.csv`

async function main() {
  const emailSnap = await firestore
    .collection('private-users')
    .select('email')
    .get()
  const emailData = emailSnap.docs.reduce((acc, doc) => {
    acc[doc.id] = doc.data().email || ''
    return acc
  }, {} as { [id: string]: string })

  const usersSnap = await firestore
    .collection('users')
    .select('username', 'createdTime')
    .orderBy('createdTime', 'desc')
    .get()

  const users = usersSnap.docs.slice(0, -30000).map((doc) => ({
    id: doc.id,
    username: doc.data().username || '',
    email: emailData[doc.id] || '',
  }))

  const parser = new Parser({ fields: ['username', 'email'] })
  const csv = parser.parse(users)

  fs.writeFileSync(outputPath, csv)
  console.log(`Emails exported to '${outputPath}'.`)
}

if (require.main === module) {
  main().then(() => process.exit())
}
