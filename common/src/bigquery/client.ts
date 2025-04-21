import { BigQuery } from '@google-cloud/bigquery'

import { logger } from '../util/logger'
import {
  GetRelevantFilesTrace,
  Relabel,
  RELABELS_SCHEMA,
  Trace,
  TRACES_SCHEMA,
} from './schema'

const DATASET =
  process.env.ENVIRONMENT === 'production'
    ? 'codebuff_data'
    : 'codebuff_data_dev'

const TRACES_TABLE = 'traces'
const RELABELS_TABLE = 'relabels'

// Create a single BigQuery client instance to be used by all functions
const client = new BigQuery()

export async function setupBigQuery(dataset: string = DATASET) {
  try {
    // Ensure dataset exists
    const [ds] = await client.dataset(dataset).get({ autoCreate: true })

    // Ensure tables exist
    await ds.table(TRACES_TABLE).get({
      autoCreate: true,
      schema: TRACES_SCHEMA,
      timePartitioning: {
        type: 'MONTH',
        field: 'created_at',
      },
      clustering: {
        fields: ['user_id', 'agent_step_id'],
      },
    })
    await ds.table(RELABELS_TABLE).get({
      autoCreate: true,
      schema: RELABELS_SCHEMA,
      timePartitioning: {
        type: 'MONTH',
        field: 'created_at',
      },
      clustering: {
        fields: ['user_id', 'agent_step_id'],
      },
    })
  } catch (error) {
    console.log('Failed to initialize BigQuery', JSON.stringify(error))
    logger.error({ error }, 'Failed to initialize BigQuery')
  }
}

export async function insertTrace(trace: Trace, dataset: string = DATASET) {
  try {
    // Create a copy of the trace and stringify payload if needed
    const traceToInsert = {
      ...trace,
      payload:
        trace.payload && typeof trace.payload !== 'string'
          ? JSON.stringify(trace.payload)
          : trace.payload,
    }

    await client.dataset(dataset).table(TRACES_TABLE).insert(traceToInsert)

    console.log('Inserted trace into BigQuery')
    logger.debug(
      { traceId: trace.id, type: trace.type },
      'Inserted trace into BigQuery'
    )
    return true
  } catch (error) {
    console.log('Failed to insert trace into BigQuery', JSON.stringify(error))
    logger.error(
      { error, traceId: trace.id },
      'Failed to insert trace into BigQuery'
    )
    return false
  }
}

export async function insertRelabel(
  relabel: Relabel,
  dataset: string = DATASET
) {
  try {
    // Stringify payload if needed
    const relabelToInsert = {
      ...relabel,
      payload:
        relabel.payload && typeof relabel.payload !== 'string'
          ? JSON.stringify(relabel.payload)
          : relabel.payload,
    }

    await client.dataset(dataset).table(RELABELS_TABLE).insert(relabelToInsert)

    logger.debug({ relabelId: relabel.id }, 'Inserted relabel into BigQuery')
    return true
  } catch (error) {
    logger.error(
      { error, relabelId: relabel.id },
      'Failed to insert relabel into BigQuery'
    )
    return false
  }
}

export async function getRecentTraces(
  limit: number = 10,
  dataset: string = DATASET
) {
  const query = `
    SELECT * FROM ${dataset}.${TRACES_TABLE}
    ORDER BY createdAt DESC
    LIMIT ${limit}
  `
  const [rows] = await client.query(query)
  // Parse the payload as JSON if it's a string
  return rows.map((row) => ({
    ...row,
    payload:
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  })) as Trace[]
}

export async function getRecentRelabels(
  limit: number = 10,
  dataset: string = DATASET
) {
  const query = `
    SELECT * FROM ${dataset}.${RELABELS_TABLE}
    ORDER BY createdAt DESC
    LIMIT ${limit}
  `
  const [rows] = await client.query(query)
  // Parse the payload as JSON if it's a string
  return rows.map((row) => ({
    ...row,
    payload:
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  })) as Relabel[]
}

export async function getTracesWithoutRelabels(
  model: string,
  limit: number = 100,
  dataset: string = DATASET
) {
  // TODO: Optimize query, maybe only get traces in last 30 days etc
  const query = `
    SELECT t.* 
    FROM \`${dataset}.${TRACES_TABLE}\` t
    LEFT JOIN (
      SELECT r.agentStepId, r.userId, JSON_EXTRACT_SCALAR(r.payload, '$.userInputId') as userInputId
      FROM \`${dataset}.${RELABELS_TABLE}\` r
      WHERE r.model = '${model}'
    ) r
    ON t.agentStepId = r.agentStepId 
       AND t.userId = r.userId
       AND JSON_EXTRACT_SCALAR(t.payload, '$.userInputId') = r.userInputId
    WHERE t.type = 'get-relevant-files'
      AND r.agentStepId IS NULL
    ORDER BY t.createdAt DESC
    LIMIT ${limit}
  `

  const [rows] = await client.query(query)
  // Parse the payload as JSON if it's a string
  return rows.map((row) => ({
    ...row,
    payload:
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  })) as GetRelevantFilesTrace[]
}

export async function getTracesWithRelabels(
  model: string,
  limit: number = 100,
  dataset: string = DATASET
) {
  // Get traces that DO have matching relabels for the specified model
  const query = `
  SELECT 
    t as trace,
    r as relabel
  FROM \`${dataset}.${TRACES_TABLE}\` t
  INNER JOIN (
    SELECT *
    FROM \`${dataset}.${RELABELS_TABLE}\` r
    WHERE r.model = '${model}'
  ) r
  ON t.agentStepId = r.agentStepId 
     AND t.userId = r.userId
     AND JSON_EXTRACT_SCALAR(t.payload, '$.userInputId') = JSON_EXTRACT_SCALAR(r.payload, '$.userInputId')
  WHERE t.type = 'get-relevant-files'
    AND JSON_EXTRACT_SCALAR(t.payload, '$.output') IS NOT NULL
    AND JSON_EXTRACT_SCALAR(r.payload, '$.output') IS NOT NULL
  ORDER BY t.createdAt DESC
  LIMIT ${limit}
  `

  const [rows] = await client.query(query)

  // Filter out any results where either trace or relabel data is missing
  const res = rows
    .filter((row) => row.trace && row.relabel)
    .map((row) => ({
      trace: row.trace as GetRelevantFilesTrace,
      relabel: row.relabel as Relabel,
    }))

  // Parse the payload as JSON if it's a string
  return res.map((row) => ({
    ...row,
    trace: {
      ...row.trace,
      payload:
        typeof row.trace.payload === 'string'
          ? JSON.parse(row.trace.payload)
          : row.trace.payload,
    },
    relabel: {
      ...row.relabel,
      payload:
        typeof row.relabel.payload === 'string'
          ? JSON.parse(row.relabel.payload)
          : row.relabel.payload,
    },
  })) as { trace: GetRelevantFilesTrace; relabel: Relabel }[]
}
