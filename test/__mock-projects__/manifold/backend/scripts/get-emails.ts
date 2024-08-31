import { writeFileSync } from 'fs'
import { initAdmin } from 'shared/init-admin'
initAdmin()
import { PrivateUser } from 'common/user'
import { getAllPrivateUsers } from 'shared/utils'

async function main() {
  const users = await getAllPrivateUsers()
  console.log('Loaded', users.length, 'users')
  const csv = users.map((user: PrivateUser) => {
    if (!user.email) return ''
    return `${user.email}`
  })
  try {
    writeFileSync('emails.csv', csv.join(','))
  } catch (err) {
    console.error(err)
  }
}

if (require.main === module) main().then(() => process.exit())
