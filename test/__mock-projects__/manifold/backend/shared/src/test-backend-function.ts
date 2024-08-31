/* eslint-disable */
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateCreatorMetricsCore } from 'shared/update-creator-metrics-core'
import { calculateImportanceScore } from 'shared/importance-score'
import { backfillUserTopicInterests } from 'shared/backfill-user-topic-interests'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    // await backfillUserTopicInterests(pg)
    // await calculateImportanceScore(db, pg)
    // await updateContractMetricsCore()
    await updateUserMetricsCore(['AJwLWoo3xue32XIiAVrL5SyR1WB2'], 0)
    // await updateCreatorMetricsCore()
  } catch (e) {
    console.error(e)
  }
}
