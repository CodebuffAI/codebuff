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

export class BigQueryClient {
  private client: BigQuery
  private dataset: string
  private tracesTable: string
  private relabelsTable: string

  constructor(dataset: string) {
    this.client = new BigQuery()
    this.dataset = dataset
    this.tracesTable = 'traces'
    this.relabelsTable = 'relabels'
  }

  async initialize() {
    try {
      // Ensure dataset exists
      const [dataset] = await this.client
        .dataset(this.dataset)
        .get({ autoCreate: true })

      // Ensure tables exist
      await dataset.table(this.tracesTable).get({
        autoCreate: true,
        schema: TRACES_SCHEMA,
        timePartitioning: {
          type: 'MONTH',
          field: 'createdAt',
        },
        clustering: {
          fields: ['userId', 'agentStepId'],
        },
      })
      await dataset.table(this.relabelsTable).get({
        autoCreate: true,
        schema: RELABELS_SCHEMA,
        timePartitioning: {
          type: 'MONTH',
          field: 'createdAt',
        },
        clustering: {
          fields: ['userId', 'agentStepId'],
        },
      })
    } catch (error) {
      console.error('Failed to initialize BigQuery', error)
      logger.error({ error }, 'Failed to initialize BigQuery')
    }
  }

  async insertTrace(trace: Trace) {
    try {
      // Create a copy of the trace and stringify payload if needed
      const traceToInsert = {
        ...trace,
        payload:
          trace.payload && typeof trace.payload !== 'string'
            ? JSON.stringify(trace.payload)
            : trace.payload,
      }

      await this.client
        .dataset(this.dataset)
        .table(this.tracesTable)
        .insert(traceToInsert)

      console.log('Inserted trace into BigQuery', trace)
      logger.debug(
        { traceId: trace.id, type: trace.type },
        'Inserted trace into BigQuery'
      )
      return true
    } catch (error) {
      console.error(
        'Failed to insert trace into BigQuery',
        JSON.stringify(error)
      )
      logger.error(
        { error, traceId: trace.id },
        'Failed to insert trace into BigQuery'
      )
      return false
    }
  }

  async insertRelabel(relabel: Relabel) {
    try {
      // Stringify payload if needed
      const relabelToInsert = {
        ...relabel,
        payload:
          relabel.payload && typeof relabel.payload !== 'string'
            ? JSON.stringify(relabel.payload)
            : relabel.payload,
      }

      await this.client
        .dataset(this.dataset)
        .table(this.relabelsTable)
        .insert(relabelToInsert)

      console.log('Inserted relabel into BigQuery', relabel)
      logger.debug({ relabelId: relabel.id }, 'Inserted relabel into BigQuery')
      return true
    } catch (error) {
      console.error(
        'Failed to insert relabel into BigQuery',
        JSON.stringify(error, null, 2)
      )
      logger.error(
        { error, relabelId: relabel.id },
        'Failed to insert relabel into BigQuery'
      )
      return false
    }
  }

  async getRecentTraces(limit: number = 10) {
    const query = `
      SELECT * FROM ${this.dataset}.${this.tracesTable}
      ORDER BY createdAt DESC
      LIMIT ${limit}
    `
    const [rows] = await this.client.query(query)
    // Parse the payload as JSON if it's a string
    return rows.map((row) => ({
      ...row,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    })) as Trace[]
  }

  async getRecentRelabels(limit: number = 10) {
    const query = `
      SELECT * FROM ${this.dataset}.${this.relabelsTable}
      ORDER BY createdAt DESC
      LIMIT ${limit}
    `
    const [rows] = await this.client.query(query)
    // Parse the payload as JSON if it's a string
    return rows.map((row) => ({
      ...row,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    })) as Relabel[]
  }

  async getTracesWithoutRelabels(model: string, limit: number = 100) {
    // TODO: Optimize query, maybe only get traces in last 30 days etc
    const query = `
      SELECT t.* 
      FROM \`${this.dataset}.${this.tracesTable}\` t
      LEFT JOIN (
        SELECT r.agentStepId, r.userId, JSON_EXTRACT_SCALAR(r.payload, '$.userInputId') as userInputId
        FROM \`${this.dataset}.${this.relabelsTable}\` r
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

    const [rows] = await this.client.query(query)
    // Parse the payload as JSON if it's a string
    return rows.map((row) => ({
      ...row,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    })) as GetRelevantFilesTrace[]
  }

  async getTracesWithRelabels(model: string, limit: number = 100) {
    // Get traces that DO have matching relabels for the specified model
    const query = `
    SELECT 
      t as trace,
      r as relabel
    FROM \`${this.dataset}.${this.tracesTable}\` t
    INNER JOIN (
      SELECT *
      FROM \`${this.dataset}.${this.relabelsTable}\` r
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

    const [rows] = await this.client.query(query)

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
}

// Export singleton instance
export const bigquery = new BigQueryClient(DATASET)
bigquery.initialize().catch((err) => {
  console.error('Failed to initialize BigQuery client', err)
})
