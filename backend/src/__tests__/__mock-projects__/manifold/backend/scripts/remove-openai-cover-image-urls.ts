import { Contract } from 'common/contract'
import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const snap = await firestore
      .collection('contracts')
      .where('createdTime', '>', new Date('2024-03-01').getTime())
      .get()
    const contracts = snap.docs.map((doc) => doc.data() as Contract)
    const openaiCoverImageContracts = contracts.filter(
      c => c.coverImageUrl?.includes('https://oaidalleapiprodscus')
    )

    console.log('contracts', contracts.length)
    console.log('openaiCoverImageContracts', openaiCoverImageContracts.length)

    const writer = firestore.bulkWriter()
    openaiCoverImageContracts.forEach(c => {
      writer.update(firestore.collection('contracts').doc(c.id), {
        coverImageUrl: null,
      })
    })

    await writer.close()
  })
}
