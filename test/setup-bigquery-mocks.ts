import { beforeEach, spyOn } from 'bun:test'

import * as bigquery from '@codebuff/bigquery'

const applyBigQueryMocks = () => {
  spyOn(bigquery, 'setupBigQuery').mockImplementation(async () => {})
  spyOn(bigquery, 'insertMessageBigquery').mockImplementation(async () => true)
  spyOn(bigquery, 'insertTrace').mockImplementation(async () => true)
  spyOn(bigquery, 'insertRelabel').mockImplementation(async () => true)
  spyOn(bigquery, 'getRecentTraces').mockImplementation(async () => [])
  spyOn(bigquery, 'getRecentRelabels').mockImplementation(async () => [])
  spyOn(bigquery, 'getTracesWithoutRelabels').mockImplementation(async () => [])
  spyOn(bigquery, 'getTracesWithRelabels').mockImplementation(async () => [])
  spyOn(bigquery, 'getTracesAndRelabelsForUser').mockImplementation(
    async () => [],
  )
  spyOn(bigquery, 'getTracesAndAllDataForUser').mockImplementation(
    async () => [],
  )
}

applyBigQueryMocks()

beforeEach(() => {
  applyBigQueryMocks()
})
