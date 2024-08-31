import * as admin from 'firebase-admin'
import { SupabaseClient } from 'common/supabase/utils'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClientTimeout,
} from 'shared/supabase/init'

initAdmin()

export const runScript = async (
  main: (services: {
    db: SupabaseClient
    pg: SupabaseDirectClientTimeout
    firestore: admin.firestore.Firestore
  }) => Promise<any> | any
) => {
  const env = getLocalEnv()
  const credentials = getServiceAccountCredentials(env)

  await loadSecretsToEnv(credentials)

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const firestore = admin.firestore()
  await main({ db, pg, firestore })

  process.exit()
}
