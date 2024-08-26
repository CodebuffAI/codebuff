import { runScript } from './run-script'

import { log } from 'shared/utils'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateGroupMetricsCore } from 'shared/update-group-metrics-core'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'

if (require.main === module) {
  runScript(async () => {
    log('Updating user metrics...')
    await updateUserMetricsCore()
    log('Updating contract metrics...')
    await updateContractMetricsCore()
    log('Updating group metrics...')
    await updateGroupMetricsCore()
  })
}
