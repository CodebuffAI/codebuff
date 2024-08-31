import { initAdmin } from 'shared/init-admin'
initAdmin()
import { PrivateUser } from 'common/user'
import { getContract, getPrivateUser, getUser } from 'shared/utils'
import { getOlderBets } from 'web/lib/supabase/bets'
import { uniq } from 'lodash'
import { filterDefined } from 'common/util/array'
import { writeCsv } from 'shared/helpers/file'

async function main() {
  const contractId = '7DCFn7dVaCVYrf7EOhFT'
  const fileName = `emails-for-contract-${contractId}.csv`
  const contract = getContract(contractId)
  if (!contract) {
    console.error('Contract not found')
    return
  }
  const bets = await getOlderBets(contractId, Date.now(), 1000)
  // group by userIds
  const userIds = uniq(bets.map((bet) => bet.userId))
  const privateUsers = filterDefined(
    await Promise.all(userIds.map((userId) => getPrivateUser(userId)))
  )
  const users = filterDefined(
    await Promise.all(userIds.map((userId) => getUser(userId)))
  )
  console.log('Loaded', privateUsers.length, 'users')
  const csv = privateUsers.map((user: PrivateUser) => {
    return {
      username: users.find((u) => u.id === user.id)?.username || '',
      email: user.email ?? '',
    }
  })
  try {
    await writeCsv(fileName, ['username', 'email'], csv)
  } catch (err) {
    console.error(err)
  }
}

if (require.main === module) main().then(() => process.exit())
