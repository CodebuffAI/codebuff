import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { getValues } from 'shared/utils'
import { Contract } from 'common/contract'

initAdmin()
const firestore = admin.firestore()

async function updateContracts() {
  console.log('Updating contracts')

  const contracts = await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('groupSlugs', 'array-contains', 'nonpredictive')
  )

  let count = 0

  for (const contract of contracts) {
    const contractRef = firestore.collection('contracts').doc(contract.id)

    await contractRef.update({ isRanked: false })

    count += 1
    console.log(`Contract updated: ${contract.id}`)
  }

  console.log(`Update complete. Total contracts updated: ${count}`)
}

if (require.main === module) {
  updateContracts()
    .then(() => process.exit())
    .catch(console.error)
}
