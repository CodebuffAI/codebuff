import { getProbability } from 'common/calculate'
import { CPMMBinaryContract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

const firestore = admin.firestore()

async function main() {
  if (process.argv.length !== 4) {
    console.log('usage: [liquidity amount] [contract slug]')
    return
  }

  const newPoolAmount = Number(process.argv[2])
  if (!isFinite(newPoolAmount) || newPoolAmount <= 0)
    throw new Error('invalid pool amount')

  const pool = { YES: newPoolAmount, NO: newPoolAmount }

  const slug = process.argv[3]
  if (!slug) throw new Error('missing slug')

  await firestore.runTransaction(async (trans) => {
    const snap = await trans.get(
      firestore.collection('contracts').where('slug', '==', slug)
    )
    const doc = snap.docs[0]
    const contract = doc.data() as CPMMBinaryContract
    const p = getProbability(contract)

    const totalLiquidity = newPoolAmount + contract.subsidyPool

    trans.update(doc.ref, { p, pool, totalLiquidity })
  })

  console.log(slug, 'liquidity changed to ', formatMoney(newPoolAmount))
}

if (require.main === module) main().then(() => process.exit())
