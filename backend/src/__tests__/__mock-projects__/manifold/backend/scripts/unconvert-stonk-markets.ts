import { initAdmin } from 'shared/init-admin'
import * as admin from 'firebase-admin'
import { StonkContract } from 'common/contract'
initAdmin()

const firestore = admin.firestore()

export const convertBinaryToStonkMarkets = async () => {
  try {
    console.log('Starting conversion of binary markets to stonk markets.')
    const creatorId = 'y1hb6k7txdZPV5mgyxPFApZ7nQl2'

    const marketsSnap = await firestore
      .collection('contracts')
      .where('outcomeType', '==', 'STONK')
      .where('isResolved', '==', false)
      .where('creatorId', '==', creatorId)
      .get()
    const marketsToConvert = marketsSnap.docs.map(
      (doc) => doc.data() as StonkContract
    )

    console.log(`Found ${marketsToConvert.length} markets to convert.`)
    await Promise.all(
      marketsToConvert.map((market) => {
        return firestore.collection('contracts').doc(market.id).update({
          outcomeType: 'BINARY',
        })
      })
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) {
  convertBinaryToStonkMarkets()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .then(() => process.exit())
}
