#!/usr/bin/env bun

import fs from 'fs'
import { runSingleEval } from './run-git-evals'
import type { EvalCommit } from './types'

process.on('message', () => {})

async function main() {
  try {
    const [tempEvalCommitPath, projectPath, clientSessionId, fingerprintId, agentType] = process.argv.slice(2)
    
    if (!tempEvalCommitPath || !projectPath || !clientSessionId || !fingerprintId) {
      throw new Error('Missing required arguments: tempEvalCommitPath, projectPath, clientSessionId, fingerprintId')
    }

    // Load eval commit from temp file
    const evalCommit = JSON.parse(fs.readFileSync(tempEvalCommitPath, 'utf-8')) as EvalCommit
    
    const result = await runSingleEval(
      evalCommit,
      projectPath,
      clientSessionId,
      fingerprintId,
      agentType || 'base'
    )

    // Send result back to parent process
    if (process.send) {
      process.send({ type: 'result', result })
    }
  } catch (error) {
    console.error('Error in run-single-eval-process-sdk:', error)
    if (process.send) {
      process.send({ type: 'error', error: { message: (error as Error).message, stack: (error as Error).stack } })
    }
    process.exit(1)
  }
}

main()