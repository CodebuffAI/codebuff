import fs from 'node:fs'
import path from 'node:path'

import type { RetrievalEffectiveness } from '@codebuff/common/util/coding-harness'

export type RetrievalAnalyticsRecord = RetrievalEffectiveness & {
  schemaVersion: 1
  taskId: string
  variant: string
  recordedAt: string
}

export function appendRetrievalAnalytics(
  root: string,
  record: Omit<RetrievalAnalyticsRecord, 'schemaVersion' | 'recordedAt'>,
): string {
  const dir = path.join(root, '.agents', 'analytics')
  fs.mkdirSync(dir, { recursive: true })
  const output = path.join(dir, 'retrieval.jsonl')
  fs.appendFileSync(
    output,
    JSON.stringify({ schemaVersion: 1, recordedAt: new Date().toISOString(), ...record }) + '\n',
  )
  return output
}
