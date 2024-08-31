import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const contracts = await firestore
      .collection('contracts')
      .where('outcomeType', '==', 'BOUNTIED_QUESTION')
      .get()

    const now = Date.now()

    for (const contract of contracts.docs) {
      const contractData = contract.data()
      if (
        contractData.closeTime &&
        contractData.closeTime < now &&
        !contractData.isResolved &&
        contractData.bountyLeft <= 0
      ) {
        await contract.ref.update({
          isResolved: true,
          resolutionTime: contractData.closeTime,
          resolverId: contractData.creatorId,
        })
      }
    }
  })
}
