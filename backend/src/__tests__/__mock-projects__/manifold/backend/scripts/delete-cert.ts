import { runScript } from 'run-script'

// there were only certs on dev so this is fine

if (require.main === module) {
  runScript(async ({ firestore, db }) => {
    // get all cert contracts
    const certs = await db
      .from('contracts')
      .select('id')
      .eq('outcome_type', 'CERT')
    if (!certs.data) {
      console.log('No cert contracts found')
      return
    }

    console.log('Deleting all cert contracts')
    for (const { id } of certs.data) {
      console.log(id)
      await firestore.collection('contracts').doc(id).delete()
    }

    // not deleting cert txns but idc
  })
}
