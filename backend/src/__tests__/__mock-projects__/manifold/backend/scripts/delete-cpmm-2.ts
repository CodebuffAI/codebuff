import { runScript } from 'run-script'
import { Firestore } from 'firebase-admin/firestore'
import { writeJson } from 'shared/helpers/file'
import { Comment } from 'common/comment'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const contractDocs = await firestore
      .collection('contracts')
      .where('mechanism', '==', 'cpmm-2')
      .get()
      .then((snap) => snap.docs)
    const contracts = contractDocs.map((d) => d.data()) as Contract[]

    // const jsonBlob = await getJsonData(firestore, contracts)
    // console.log('Writing json file')
    // await writeJson('cpmm-2-market-data.json', jsonBlob)

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
        .collection('liquidity')
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

const getJsonData = async (firestore: Firestore, contracts: Contract[]) => {
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
