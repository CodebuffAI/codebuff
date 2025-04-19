import { BigQuery } from '@google-cloud/bigquery'

import { logger } from '../util/logger'
import { Relabel, RELABELS_SCHEMA, Trace, TRACES_SCHEMA } from './schema'

const DATASET =
  process.env.ENVIRONMENT === 'production'
    ? 'codebuff_data'
    : 'codebuff_data_dev'

export class BigQueryClient {
  private client: BigQuery
  private dataset: string
  private tracesTable: string
  private relabelsTable: string

  constructor() {
    this.client = new BigQuery()
    this.dataset = DATASET
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
      await dataset
        .table(this.tracesTable)
        .get({ autoCreate: true, schema: TRACES_SCHEMA })
      await dataset
        .table(this.relabelsTable)
        .get({ autoCreate: true, schema: RELABELS_SCHEMA })
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
      await this.client
        .dataset(this.dataset)
        .table(this.relabelsTable)
        .insert(relabel)

      console.log('Inserted relabel into BigQuery', relabel)
      logger.debug({ relabelId: relabel.id }, 'Inserted relabel into BigQuery')
      return true
    } catch (error) {
      console.error('Failed to insert relabel into BigQuery', error)
      logger.error(
        { error, relabelId: relabel.id },
        'Failed to insert relabel into BigQuery'
      )
      return false
    }
  }
}

// Export singleton instance
export const bigquery = new BigQueryClient()
bigquery.initialize().catch((err) => {
  console.error('Failed to initialize BigQuery client', err)
})
