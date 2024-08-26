import { Contract } from 'common/contract'
import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ firestore, db }) => {
    const contractQuery = firestore.collection('contracts').orderBy('importanceScore', 'desc')

    let lastContractId = null

    while (true) {
      let query = contractQuery

      if (lastContractId) {
        query = query.startAfter(lastContractId)
      }

      const contractDocs = await query.limit(500).get()

      if (contractDocs.empty) {
        break
      }

      for (const doc of contractDocs.docs) {
        const contract = doc.data() as Contract
        console.log(
          `Scoring contract`,
          contract.slug,
          'importance',
          contract.importanceScore
        )
        await db
          .from('contracts')
          .update({ importance_score: contract.importanceScore ?? 0 } as any)
          .eq('id', contract.id)
        lastContractId = contract.id
      }
    }
  })
}
