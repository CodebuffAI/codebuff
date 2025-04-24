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
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'production'
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

    logger.debug(
      { traceId: trace.id, type: trace.type },
      'Inserted trace into BigQuery'
    )
    return true
  } catch (error) {
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
    ORDER BY created_at DESC
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
    ORDER BY created_at DESC
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
  userId: string | undefined = undefined,
  dataset: string = DATASET
) {
  // TODO: Optimize query, maybe only get traces in last 30 days etc
  const query = `
    SELECT t.*
    FROM \`${dataset}.${TRACES_TABLE}\` t
    LEFT JOIN (
      SELECT r.agent_step_id, r.user_id, JSON_EXTRACT_SCALAR(r.payload, '$.user_input_id') as user_input_id
      FROM \`${dataset}.${RELABELS_TABLE}\` r
      WHERE r.model = '${model}'
      ${userId ? `AND r.user_id = '${userId}'` : ''}
    ) r
    ON t.agent_step_id = r.agent_step_id
       AND t.user_id = r.user_id
       AND JSON_EXTRACT_SCALAR(t.payload, '$.user_input_id') = r.user_input_id
    WHERE t.type = 'get-relevant-files'
      AND r.agent_step_id IS NULL
      ${userId ? `AND t.user_id = '${userId}'` : ''}
    ORDER BY t.created_at DESC
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
    ANY_VALUE(t) as trace,
    ARRAY_AGG(r ORDER BY r.created_at DESC LIMIT 1)[OFFSET(0)] as relabel
  FROM \`${dataset}.${TRACES_TABLE}\` t
  INNER JOIN (
    SELECT *
    FROM \`${dataset}.${RELABELS_TABLE}\` r
    WHERE r.model = '${model}'
  ) r
  ON t.agent_step_id = r.agent_step_id
     AND t.user_id = r.user_id
     AND JSON_EXTRACT_SCALAR(t.payload, '$.user_input_id') = JSON_EXTRACT_SCALAR(r.payload, '$.user_input_id')
  WHERE t.type = 'get-relevant-files'
    AND JSON_EXTRACT_SCALAR(t.payload, '$.output') IS NOT NULL
    AND JSON_EXTRACT_SCALAR(r.payload, '$.output') IS NOT NULL
  GROUP BY t.agent_step_id
  ORDER BY MAX(t.created_at) DESC
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

export async function getTracesAndRelabelsForUser(
  userId: string,
  limit: number = 50,
  dataset: string = DATASET
) {
  // Get recent traces for the user and any associated relabels
  const query = `
  WITH traces AS (
    SELECT
      id,
      agent_step_id,
      user_id,
      created_at,
      type,
      payload
    FROM \`${dataset}.${TRACES_TABLE}\`
    WHERE user_id = '${userId}' AND type = 'get-relevant-files'
    ORDER BY created_at DESC
    LIMIT ${limit}
  )
  SELECT
    t.id,
    ANY_VALUE(t.agent_step_id) as agent_step_id,
    ANY_VALUE(t.user_id) as user_id,
    ANY_VALUE(t.created_at) as created_at,
    ANY_VALUE(t.type) as type,
    ANY_VALUE(t.payload) as payload,
    ARRAY_AGG(r IGNORE NULLS) as relabels
  FROM traces t
  LEFT JOIN \`${dataset}.${RELABELS_TABLE}\` r
  ON t.agent_step_id = r.agent_step_id
     AND t.user_id = r.user_id
     AND JSON_EXTRACT_SCALAR(t.payload, '$.user_input_id') = JSON_EXTRACT_SCALAR(r.payload, '$.user_input_id')
  GROUP BY t.id
  ORDER BY ANY_VALUE(t.created_at) DESC
  `

  const [rows] = await client.query(query)

  // Process and parse the results
  return rows.map((row) => {
    // Create trace object from individual fields
    const trace = {
      id: row.id,
      agent_step_id: row.agent_step_id,
      user_id: row.user_id,
      created_at: row.created_at,
      type: row.type,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    } as GetRelevantFilesTrace

    // Parse relabel payloads (if any exist)
    const relabels =
      row.relabels && row.relabels.length > 0
        ? (row.relabels.map((relabel: any) => ({
            ...relabel,
            payload:
              typeof relabel.payload === 'string'
                ? JSON.parse(relabel.payload)
                : relabel.payload,
          })) as Relabel[])
        : []

    return { trace, relabels }
  })
}
