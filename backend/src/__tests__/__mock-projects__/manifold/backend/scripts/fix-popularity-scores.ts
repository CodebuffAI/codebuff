import { runScript } from './run-script'

import { log } from 'shared/utils'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const writer = new SafeBulkWriter()
    const contracts = await firestore.collection('contracts').get()
    const now = Date.now()
    let n = 0
    log(`Loaded ${contracts.size} contracts.`)
    for (const doc of contracts.docs) {
      if (typeof doc.get('popularityScore') === 'string') {
        // no idea how these got busted, but fix them. `lastUpdatedTime` will
        // cause them to get rescored next hour by scoreContracts
        log(`Fixing broken score on contract ${doc.id}.`)
        writer.update(doc.ref, { popularityScore: 0, lastUpdatedTime: now })
        n++
      }
    }
    log(`Fixed ${n} contracts.`)
    await writer.close()
  })
}
