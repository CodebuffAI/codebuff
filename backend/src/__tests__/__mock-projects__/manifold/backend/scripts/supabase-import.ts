import * as admin from 'firebase-admin'
import {
  CollectionReference,
  CollectionGroup,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { chunk } from 'lodash'
import { withRetries } from 'common/util/promise'
import { log, processPartitioned } from 'shared/utils'
import { runScript } from './run-script'
import { DAY_MS } from 'common/util/time'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsert } from 'shared/supabase/utils'
import { TableName } from 'common/supabase/utils'
import { Command } from 'commander'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

// strategy for live importing collection C without dropping data (times are firestore server times)
// 1. optional - clear supabase table for collection C
// 2. start replication of new collection C transaction log entries to supabase starting at T0
// 3. establish import starting timestamp T1 such that T0 <= T1 <= now
// 4. read collection C from firestore with effective timestamp T1 and send supabase writes
// 5. supabase should be caught up

async function getServerTimestamp() {
  // firestore doesn't seem to have an API to just ask for the time, so we do this kludge
  const result = await admin.firestore().collection('temp').doc('time').get()
  return result.readTime.toDate()
}

function getWriteRow(
  snap: QueryDocumentSnapshot,
  tableName: TableName,
  ts: Date
) {
  return {
    write_kind: 'update',
    table_id: tableName,
    doc_id: snap.id,
    parent_id: snap.ref.parent.parent?.id,
    data: snap.data(),
    ts: ts.toISOString(),
  }
}

async function importCollection(
  pg: SupabaseDirectClient,
  source: CollectionReference,
  tableName: TableName,
  batchSize: number
) {
  log(`Preparing to import ${tableName} documents.`)
  const t1 = await getServerTimestamp()
  const n = (await source.count().get()).data().count
  log(`Documents to import: ${n}. Timestamp: ${t1.toISOString()}.`)

  const snaps = await source.get()
  log(`Loaded ${snaps.size} documents.`)
  for (const batch of chunk(snaps.docs, batchSize)) {
    const rows = batch.map((d) => getWriteRow(d, tableName, t1))
    await withRetries(bulkInsert(pg, 'incoming_writes', rows))
    log(`Processed ${rows.length} documents.`)
  }
  log(`Imported ${snaps.size} documents.`)
}

async function importCollectionGroup(
  pg: SupabaseDirectClient,
  source: CollectionGroup,
  tableName: TableName,
  predicate: (d: QueryDocumentSnapshot) => boolean,
  batchSize: number
) {
  log(`Preparing to import ${tableName} documents.`)
  const t1 = await getServerTimestamp()
  const n = (await source.count().get()).data().count
  log(`Documents to import: ${n}. Timestamp: ${t1.toISOString()}.`)

  // partitions are different sizes so be conservative
  const partitions = Math.ceil(n / batchSize) * 2
  await processPartitioned(source, partitions, async (docs) => {
    const rows = docs
      .filter(predicate)
      .map((d) => getWriteRow(d, tableName, t1))
    await withRetries(bulkInsert(pg, 'incoming_writes', rows))
  })
}
// This function is for importing immutable data in an append-only fashion starting from a given timestamp.
// In case the import fails, it can be restarted from the last successfully processed timestamp.
async function importAppendOnlyCollectionGroup(
  pg: SupabaseDirectClient,
  source: CollectionGroup,
  tableName: TableName,
  predicate: (d: QueryDocumentSnapshot) => boolean,
  batchSize: number,
  chunkTime = 0.25,
  startTime = 0,
  timePropName = 'timestamp'
) {
  log(`Preparing to import ${tableName} documents.`)
  const t1 = await getServerTimestamp()
  const n = (await source.count().get()).data().count
  if (startTime === 0) {
    startTime = await source
      .orderBy(timePropName, 'asc')
      .limit(1)
      .get()
      .then((snap) => {
        return snap.docs[0].data()[timePropName]
      })
  }
  const originalStartTime = startTime
  log(
    `Total documents in the collection: ${n}. Timestamp: ${t1.toISOString()}. Starting from: ${startTime}. Using ${chunkTime} day chunks.`
  )
  let totalProcessed = 0
  const delta = chunkTime * DAY_MS
  while (startTime < t1.getTime()) {
    const endTime = Math.min(startTime + delta, t1.getTime())
    const snap = await source
      .where(timePropName, '>=', startTime)
      .where(timePropName, '<', endTime)
      .get()
    log(`Loaded ${snap.size} documents.`)

    for (const batch of chunk(snap.docs, batchSize)) {
      const rows = batch.map((d) => getWriteRow(d, tableName, t1))
      await withRetries(bulkInsert(pg, 'incoming_writes', rows))
    }
    totalProcessed += snap.size
    log(`Processed ${snap.size} documents from ${startTime} to ${endTime}.`)
    log(`Use ${endTime} as the starting point for the next run.`)
    startTime = endTime
    log(
      `Total documents processed: ${totalProcessed}. Total % time processed: ${(
        ((endTime - originalStartTime) / (t1.getTime() - originalStartTime)) *
        100
      ).toFixed(2)}%.`
    )
  }
}

async function clearFailedWrites() {
  const firestore = admin.firestore()
  log('Clearing failed writes...')
  const refs = await firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites')
    .listDocuments()
  const deleter = new SafeBulkWriter({ throttling: false })
  for (const ref of refs) {
    deleter.delete(ref)
  }
  await deleter.close()
}

async function importDatabase(
  pg: SupabaseDirectClient,
  tables?: string[],
  startTime = 0,
  timeChunk = 0.25
) {
  const firestore = admin.firestore()
  const shouldImport = (t: TableName) => tables == null || tables.includes(t)

  if (tables == null) {
    await clearFailedWrites()
  }

  if (shouldImport('private_users'))
    await importCollection(
      pg,
      firestore.collection('private-users'),
      'private_users',
      500
    )
  if (shouldImport('users'))
    await importCollection(pg, firestore.collection('users'), 'users', 500)
  if (shouldImport('user_portfolio_history'))
    await importAppendOnlyCollectionGroup(
      pg,
      firestore.collectionGroup('portfolioHistory'),
      'user_portfolio_history',
      (_) => true,
      2000,
      timeChunk,
      startTime
    )
  if (shouldImport('user_contract_metrics'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('contract-metrics'),
      'user_contract_metrics',
      (_) => true,
      2500
    )
  if (shouldImport('user_follows'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('follows'),
      'user_follows',
      (c) => c.ref.parent.parent?.parent.path === 'users',
      5000
    )
  if (shouldImport('user_reactions'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('reactions'),
      'user_reactions',
      (_) => true,
      2500
    )
  if (shouldImport('user_events'))
    await importAppendOnlyCollectionGroup(
      pg,
      firestore.collectionGroup('events'),
      'user_events',
      (c) => c.ref.parent.parent?.parent.path === 'users',
      2500,
      timeChunk,
      startTime
    )
  if (shouldImport('user_notifications'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('notifications'),
      'user_notifications',
      (_) => true,
      2500
    )
  if (shouldImport('contracts'))
    await importCollection(
      pg,
      firestore.collection('contracts'),
      'contracts',
      500
    )
  if (shouldImport('contract_answers'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('answers'),
      'contract_answers',
      (_) => true,
      2500
    )
  if (shouldImport('contract_bets'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('bets'),
      'contract_bets',
      (_) => true,
      2500
    )
  if (shouldImport('contract_comments'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('comments'),
      'contract_comments',
      (c) => c.get('commentType') === 'contract',
      500
    )
  if (shouldImport('contract_follows'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('follows'),
      'contract_follows',
      (c) => c.ref.parent.parent?.parent.path == 'contracts',
      5000
    )
  if (shouldImport('contract_liquidity'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('liquidity'),
      'contract_liquidity',
      (_) => true,
      2500
    )
  if (shouldImport('groups'))
    await importCollection(pg, firestore.collection('groups'), 'groups', 500)
  if (shouldImport('group_contracts'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('groupContracts'),
      'group_contracts',
      (_) => true,
      5000
    )
  if (shouldImport('group_members'))
    await importCollectionGroup(
      pg,
      firestore.collectionGroup('groupMembers'),
      'group_members',
      (_) => true,
      5000
    )
  if (shouldImport('txns'))
    await importAppendOnlyCollectionGroup(
      pg,
      firestore.collectionGroup('txns'),
      'txns',
      (_) => true,
      2500,
      timeChunk,
      startTime,
      'createdTime'
    )
  if (shouldImport('manalinks'))
    await importCollection(
      pg,
      firestore.collection('manalinks'),
      'manalinks',
      2500
    )
}

if (require.main === module) {
  const program = new Command()
  program.requiredOption(
    '-t, --tables <tables>',
    '(Required) Comma-separated list of tables to import'
  )
  program.option(
    '-ts, --timestamp <timestamp>',
    'Timestamp to start append only import, (user_events, user_portfolio_history, and txns)',
    parseInt
  )
  program.option(
    '-c, --chunk <chunk>',
    'Fraction of a day to chunk append only imports by, (user_events, user_portfolio_history, and txns)',
    parseFloat
  )
  program.parse(process.argv)
  const options = program.opts()
  const { timestamp, chunk } = options
  const tables = options.tables.split(',')
  log('Importing tables:', tables)
  if (timestamp != null) log('Starting at timestamp:', timestamp)
  if (chunk != null) log('Chunking by:', chunk, 'day(s)')

  runScript(async ({ pg }) => {
    await importDatabase(pg, tables, timestamp, chunk)
  })
    .then(() => {
      log('Finished importing.')
    })
    .catch((e) => {
      console.error(e)
    })
}
