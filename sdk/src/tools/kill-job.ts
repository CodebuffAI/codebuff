import { killBackgroundJob } from './background-jobs'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

export async function killJob(params: {
  jobId: string
  signal?: 'SIGTERM' | 'SIGKILL'
}): Promise<CodebuffToolOutput<'kill_job'>> {
  const signal = params.signal ?? 'SIGTERM'
  const result = killBackgroundJob(params.jobId, signal)
  return [
    {
      type: 'json',
      value: result,
    },
  ]
}
