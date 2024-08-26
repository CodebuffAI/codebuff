import { initAdmin } from 'shared/init-admin'
import * as admin from 'firebase-admin'
import { richTextToString } from 'common/util/parse'
import { BinaryContract } from 'common/contract'
import { uniqBy } from 'lodash'
import { DAY_MS } from 'common/util/time'
initAdmin()

const firestore = admin.firestore()

export const convertBinaryToStonkMarkets = async () => {
  try {
    console.log('Starting conversion of binary markets to stonk markets.')
    // get all binary markets
    const marketsSnap = await firestore
      .collection('contracts')
      .where('outcomeType', '==', 'BINARY')
      .where('isResolved', '==', false)
      .get()
    const binaryMarkets = marketsSnap.docs.map(
      (doc) => doc.data() as BinaryContract
    )
    // const contract = await getContract('F3KkEuwxBGAg6hCg3Wrj')
    // if (!contract) {
    //   console.error('Could not find contract.')
    //   return
    // }
    // const binaryMarkets = [contract]

    console.log(`Found ${binaryMarkets.length} binary markets.`)
    // filter for markets that have stock and (permanent) in the name
    const marketsWithStockTitle = binaryMarkets.filter((market) => {
      const question = market.question.toLowerCase()
      return question.includes('stock') && question.includes('permanent')
    })
    console.log(
      `Found ${marketsWithStockTitle.length} markets with the right title.`
    )
    const marketsWithStockDescription = binaryMarkets.filter((market) => {
      const desc = market.description
      const stringDesc =
        typeof desc === 'string'
          ? desc.toLowerCase()
          : richTextToString(desc).toLowerCase()
      return (
        stringDesc.includes('permanent market') ||
        stringDesc.includes('permanent stock') ||
        stringDesc.includes('yes = buy') ||
        stringDesc.includes(
          'this is a permanent market and its duration will be lengthened as long as'
        )
      )
    })
    console.log(
      `Found ${marketsWithStockDescription.length} markets with the right description.`
    )

    // combine them uniquely via id
    const uniqMarketsToConvert = uniqBy(
      [...marketsWithStockTitle, ...marketsWithStockDescription],
      'id'
    )
    console.log(
      `Found ${uniqMarketsToConvert.length} markets to convert without filtering.`
    )
    const slugsToIgnore = [
      'will-qorantos-stock-permanent-reach',
      'will-any-permanent-stock-with-at-le',
      'manifold-bans-permanent-stock-marke',
      'smeth-stock-hopefully-not-permanent',
      'fancysloth-stock-hopefully-not-perm',
      'will-a-crazy-sexual-partner-of-dest',
    ]
    const marketsToConvert = uniqMarketsToConvert.filter(
      (market) => !slugsToIgnore.includes(market.slug)
    )
    console.log(`Found ${marketsToConvert.length} markets to convert.`)
    await Promise.all(
      marketsToConvert.map((market) => {
        return firestore
          .collection('contracts')
          .doc(market.id)
          .update({
            outcomeType: 'STONK',
            closeTime: Date.now() + DAY_MS * 365 * 1000,
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
