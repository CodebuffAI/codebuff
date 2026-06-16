import { beforeEach, spyOn } from 'bun:test'

import * as logging from '@codebuff/logging'

const applyLoggingMocks = () => {
  spyOn(logging, 'enqueueLogRow').mockImplementation(() => {})
  spyOn(logging, 'flushLogSink').mockImplementation(async () => {})
}

applyLoggingMocks()

beforeEach(() => {
  applyLoggingMocks()
})
