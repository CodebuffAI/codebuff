import { runScript } from 'run-script'
import { NumericContract } from 'common/contract'
import { Firestore } from 'firebase-admin/firestore'
import { writeJson } from 'shared/helpers/file'
import { Comment } from 'common/comment'
import { Bet } from 'common/bet'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const contractDocs = await firestore
      .collection('contracts')
      .where('mechanism', '==', 'dpm-2')
      .where('outcomeType', '==', 'NUMERIC')
      .get()
      .then((snap) => snap.docs)
    const contracts = contractDocs.map((d) => d.data()) as NumericContract[]

    // const jsonBlob = await getNumericData(firestore, contracts)
    // console.log('Writing json file')
    // await writeJson('numeric-dpm-market-data.json', jsonBlob)

    for (const contract of contracts) {
    console.log('Deleting contract:', contract.slug)
      const contractRef = firestore.collection('contracts').doc(contract.id)
      await contractRef
        .collection('follows')
        .get()
        .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete())))
      await contractRef
        .collection('comments')
        .get()
        .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete())))
      await contractRef
        .collection('bets')
        .get()
        .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete())))
      await contractRef.delete()
    }
  })
}

const getNumericData = async (
  firestore: Firestore,
  contracts: NumericContract[]
) => {
  const jsonBlob: { [key: string]: any } = {}

  for (const contract of contracts) {
    const contractRef = firestore.collection('contracts').doc(contract.id)
    const comments = await contractRef
      .collection('comments')
      .get()
      .then((snap) => snap.docs.map((d) => d.data() as Comment))

    const bets = await contractRef
      .collection('bets')
      .get()
      .then((snap) => snap.docs.map((d) => d.data() as Bet))

    jsonBlob[contract.slug] = contract
    jsonBlob[`${contract.slug}-comments`] = comments
    jsonBlob[`${contract.slug}-bets`] = bets

    console.log('Contract:', contract.slug)
    // console.log('Comments:', comments.length, comments)
    // console.log('Bets:', bets.length, bets)
  }

  return jsonBlob
}
