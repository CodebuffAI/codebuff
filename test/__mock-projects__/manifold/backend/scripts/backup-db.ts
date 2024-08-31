import { v1 } from 'firebase-admin/firestore'
import { getServiceAccountCredentials } from 'shared/init-admin'
import { backupDbCore } from 'functions/scheduled/backup-db'

async function backupDb() {
  const credentials = getServiceAccountCredentials()
  const projectId = credentials.project_id
  const client = new v1.FirestoreAdminClient({ credentials })
  const bucket = 'manifold-firestore-backup'
  const resp = await backupDbCore(client, projectId, bucket)
  console.log(`Operation: ${resp[0]['name']}`)
}

if (require.main === module) {
  backupDb().then(() => process.exit())
}
