import { getErrorObject } from '@codebuff/common/util/error'
import { BigQuery } from '@google-cloud/bigquery'

import { MESSAGE_SCHEMA, RELABELS_SCHEMA, TRACES_SCHEMA } from './schema'

import type { BaseTrace, GetRelevantFilesTrace, Relabel, Trace } from './schema'
import type { MessageRow } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const DATASET =
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod'
    ? 'codebuff_data'
    : 'codebuff_data_dev'

const TRACES_TABLE = 'traces'
const RELABELS_TABLE = 'relabels'
const MESSAGE_TABLE = 'message'

// Create a single BigQuery client instance to be used by all functions
let client: BigQuery | null = null

function getClient(): BigQuery {
  if (!client) {
    throw new Error(
      'BigQuery client not initialized. Call setupBigQuery first.',
    )
  }
  return client
}

export async function setupBigQuery({
  dataset = DATASET,
  logger,
}: {
  dataset?: string
  logger: Logger
}) {
  if (client) {
    return
  }
  try {
    client = new BigQuery()

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
    await ds.table(MESSAGE_TABLE).get({
      autoCreate: true,
      schema: MESSAGE_SCHEMA,
      timePartitioning: {
        type: 'MONTH',
        field: 'finished_at',
      },
      clustering: {
        fields: ['user_id'],
      },
    })
  } catch (error) {
    logger.error(
      {
        error,
        stack: (error as Error).stack,
        message: (error as Error).message,
        name: (error as Error).name,
        code: (error as any).code,
        details: (error as any).details,
      },
      'Failed to initialize BigQuery',
    )
    throw error // Re-throw to be caught by caller
  }
}

export async function insertMessageBigquery({
  row,
  dataset = DATASET,
  logger,
}: {
  row: MessageRow
  dataset?: string
  logger: Logger
}) {
  try {
    await getClient()
      .dataset(dataset)
      .table(MESSAGE_TABLE)
      .insert({ ...row, request: JSON.stringify(row.request) })

    logger.debug(
      {
        ...row,
        request: undefined,
      },
      'Inserted message into BigQuery',
    )
    return true
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), messageId: row.id },
      'Failed to insert message into BigQuery',
    )

    return false
  }
}

export async function insertTrace({
  trace,
  dataset = DATASET,
  logger,
}: {
  trace: Trace
  dataset?: string
  logger: Logger
}) {
  try {
    // Create a copy of the trace and stringify payload if needed
    const traceToInsert = {
      ...trace,
      payload:
        trace.payload && typeof trace.payload !== 'string'
          ? JSON.stringify(trace.payload)
          : trace.payload,
    }

    await getClient().dataset(dataset).table(TRACES_TABLE).insert(traceToInsert)

    logger.debug(
      { traceId: trace.id, type: trace.type },
      'Inserted trace into BigQuery',
    )
    return true
  } catch (error) {
    logger.error(
      { error, traceId: trace.id },
      'Failed to insert trace into BigQuery',
    )
    return false
  }
}

export async function insertRelabel({
  relabel,
  dataset = DATASET,
  logger,
}: {
  relabel: Relabel
  dataset?: string
  logger: Logger
}) {
  try {
    // Stringify payload if needed
    const relabelToInsert = {
      ...relabel,
      payload:
        relabel.payload && typeof relabel.payload !== 'string'
          ? JSON.stringify(relabel.payload)
          : relabel.payload,
    }

    await getClient()
      .dataset(dataset)
      .table(RELABELS_TABLE)
      .insert(relabelToInsert)

    logger.debug({ relabelId: relabel.id }, 'Inserted relabel into BigQuery')
    return true
  } catch (error) {
    logger.error(
      { error, relabelId: relabel.id },
      'Failed to insert relabel into BigQuery',
    )
    return false
  }
}

export async function getRecentTraces(
  limit: number = 10,
  dataset: string = DATASET,
) {
  const query = `
    SELECT * FROM ${dataset}.${TRACES_TABLE}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  const [rows] = await getClient().query(query)
  // Parse the payload as JSON if it's a string
  return rows.map((row) => ({
    ...row,
    payload:
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  })) as Trace[]
}

export async function getRecentRelabels(
  limit: number = 10,
  dataset: string = DATASET,
) {
  const query = `
    SELECT * FROM ${dataset}.${RELABELS_TABLE}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  const [rows] = await getClient().query(query)
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
  dataset: string = DATASET,
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

  const [rows] = await getClient().query(query)
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
  dataset: string = DATASET,
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

  const [rows] = await getClient().query(query)

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
  userId?: string,
  limit: number = 50,
  cursor: string | undefined = undefined,
  dataset: string = DATASET,
  joinType: 'INNER' | 'LEFT' = 'LEFT',
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
    WHERE type = 'get-relevant-files'
    ${userId ? `AND user_id = '${userId}'` : ''}
    ${cursor ? `AND created_at < '${cursor}'` : ''}
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
  ${joinType === 'INNER' ? 'INNER JOIN' : 'LEFT JOIN'} \`${dataset}.${RELABELS_TABLE}\` r
  ON t.agent_step_id = r.agent_step_id
     AND t.user_id = r.user_id
     AND JSON_EXTRACT_SCALAR(t.payload, '$.user_input_id') = JSON_EXTRACT_SCALAR(r.payload, '$.user_input_id')
  GROUP BY t.id
  ORDER BY ANY_VALUE(t.created_at) DESC
  `

  const [rows] = await getClient().query(query)

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

export interface TraceBundle {
  trace: GetRelevantFilesTrace // the base row
  relatedTraces: BaseTrace[] // the extras (runtime-typed)
  relabels: Relabel[]
}
export async function getTracesAndAllDataForUser(
  userId?: string,
  limit = 50,
  pageCursor?: string,
  dataset = DATASET,
): Promise<TraceBundle[]> {
  const EXTRA_TRACE_TYPES = [
    'get-expanded-file-context-for-training',
    'get-expanded-file-context-for-training-blobs',
    'grade-run',
  ] as const

  /* prettier-ignore */
  const sql = `
  /*──────────────── base (latest N get-relevant-files rows) ─────────────*/
  WITH base AS (
    SELECT id, agent_step_id, user_id, created_at, type, payload
    FROM   \`${dataset}.${TRACES_TABLE}\`
    WHERE  ${userId ? 'user_id = @userId AND' : ''} type = 'get-relevant-files' AND JSON_EXTRACT_SCALAR(payload, '$.request_type') = 'Key'
           ${pageCursor ? 'AND created_at < @pageCursor' : ''}
    ORDER  BY created_at DESC
    LIMIT  @limit
  ),

  /*───────────── extra traces that share agent_step_id,user_id ──────────*/
  filtered AS (
    SELECT t.id, t.agent_step_id, t.user_id, t.created_at, t.type, t.payload
    FROM   \`${dataset}.${TRACES_TABLE}\` AS t
    JOIN   base                         AS b
           USING (agent_step_id, user_id)
    WHERE  t.type IN (${EXTRA_TRACE_TYPES.map(t => `'${t}'`).join(', ')})
  ),

  all_rows AS (
    SELECT * FROM base
    UNION ALL
    SELECT * FROM filtered
  )

  /*────────────────────────── final aggregation ─────────────────────────*/
  SELECT
    ANY_VALUE(IF(type='get-relevant-files', t.id,         NULL)) AS id,
    t.agent_step_id,
    ANY_VALUE(IF(type='get-relevant-files', t.user_id,    NULL)) AS user_id,
    ANY_VALUE(IF(type='get-relevant-files', t.created_at, NULL)) AS created_at,
    ANY_VALUE(IF(type='get-relevant-files', t.payload,    NULL)) AS payload,

    ARRAY_AGG(
      CASE
        WHEN type <> 'get-relevant-files'
        THEN STRUCT(t.id, t.created_at, t.type, t.payload)
      END
      IGNORE NULLS
      ORDER BY t.created_at
    ) AS related_traces,

    ARRAY_AGG(r IGNORE NULLS) AS relabels
  FROM all_rows AS t
  LEFT JOIN \`${dataset}.${RELABELS_TABLE}\` AS r
    ON  t.agent_step_id = r.agent_step_id
    AND t.user_id       = r.user_id
    AND JSON_EXTRACT_SCALAR(t.payload, '$.user_input_id')
        = JSON_EXTRACT_SCALAR(r.payload, '$.user_input_id')
  GROUP BY agent_step_id
  ORDER BY created_at DESC
  `

  const [rows] = await getClient().query({
    query: sql,
    params: {
      ...(userId ? { userId } : {}),
      limit,
      ...(pageCursor ? { pageCursor } : {}),
    },
  })

  /*──────────────────── shape rows into typed bundles ───────────────────*/
  return rows.map((row: any) => {
    const trace: GetRelevantFilesTrace = {
      id: row.id,
      agent_step_id: row.agent_step_id,
      user_id: row.user_id,
      created_at: row.created_at,
      type: 'get-relevant-files',
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }

    const relatedTraces: BaseTrace[] = (row.related_traces || []).map(
      (r: any) => ({
        ...r,
        payload:
          typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      }),
    )

    const relabels: Relabel[] = (row.relabels || []).map((r: any) => ({
      ...r,
      payload:
        typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }))

    return { trace, relatedTraces, relabels }
  })
}
