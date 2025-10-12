#!/usr/bin/env bun

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { mapLimit } from 'async'
import { createTwoFilesPatch } from 'diff'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import { loadLocalAgents } from '@codebuff/npm-app/agents/load-agents'
import { CodebuffClient } from '../../sdk/src/client'
import { withTestRepoAndParent } from '../subagents/test-repo-utils'

import type {
  EvalData,
  EvalCommit,
  EvalDataV2,
  EvalCommitV2,
  FileDiff,
} from './types'

function fileStatesToFileDiffs(
  oldCommit: EvalCommit,
  parentSha: string,
): FileDiff[] {
  const fileDiffs: FileDiff[] = []

  for (const fileState of oldCommit.fileStates) {
    const oldContent = fileState.preContent || ''
    const newContent = fileState.postContent || ''

    let statusType: FileDiff['status'] = 'modified'
    if (!fileState.preContent) {
      statusType = 'added'
    } else if (!fileState.postContent) {
      statusType = 'deleted'
    }

    const diff = createTwoFilesPatch(
      fileState.path,
      fileState.path,
      oldContent,
      newContent,
      `${parentSha.slice(0, 7)} (parent)`,
      `${oldCommit.sha.slice(0, 7)} (commit)`,
    )

    fileDiffs.push({
      path: fileState.path,
      status: statusType,
      oldPath: undefined,
      diff,
    })
  }

  return fileDiffs
}

async function migrateCommit(
  oldCommit: EvalCommit,
  repoUrl: string,
  client: CodebuffClient,
  agentDefinitions: any[],
): Promise<EvalCommitV2 | null> {
  const parentSha = oldCommit.parentSha || oldCommit.sha
  const fileDiffs = fileStatesToFileDiffs(oldCommit, parentSha)

  const editedFilePaths = oldCommit.fileStates.map((fs) => fs.path)

  const fullDiff = fileDiffs.map((fd) => fd.diff).join('\n')

  return await withTestRepoAndParent(
    {
      repoUrl,
      commitSha: oldCommit.sha,
      initCommand: undefined,
    },
    async (repoPath, commitSha, parentSha) => {
      const commitMessage = execSync(`git log --format=%B -n 1 ${commitSha}`, {
        cwd: repoPath,
        encoding: 'utf-8',
      }).trim()

      console.log(`Generating task for ${commitSha.slice(0, 8)}...`)

      const { generateEvalTask } = await import('./eval-task-generator')
      const taskResult = await generateEvalTask({
        client,
        input: {
          commitSha,
          parentSha,
          diff: fullDiff,
          editedFilePaths,
          commitMessage,
          repoPath,
        },
        agentDefinitions,
      })

      console.log(`Task ID: ${taskResult.id}`)
      console.log(
        `Generated spec: ${taskResult.spec.substring(0, 100)}...`,
      )
      console.log(
        `Generated prompt: ${taskResult.prompt.substring(0, 100)}...`,
      )
      console.log(
        `Supplemental files: ${taskResult.supplementalFiles.length} files`,
      )

      return {
        id: taskResult.id,
        sha: commitSha,
        parentSha,
        spec: taskResult.spec || oldCommit.spec,
        prompt: taskResult.prompt,
        supplementalFiles: taskResult.supplementalFiles,
        fileDiffs,
      }
    },
  )
}

export async function migrateEvalFile({
  inputPath,
  outputPath,
  batchSize = 3,
}: {
  inputPath: string
  outputPath?: string
  batchSize?: number
}): Promise<void> {
  console.log(`\n=== Migrating ${inputPath} to V2 format ===\n`)

  const oldEvalData: EvalData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))

  console.log(`Found ${oldEvalData.evalCommits.length} commits to migrate`)
  console.log(`Repo URL: ${oldEvalData.repoUrl}`)

  const agentsPath = path.join(__dirname, '../../.agents')
  const localAgentDefinitions = Object.values(
    await loadLocalAgents({ agentsPath }),
  )

  const client = new CodebuffClient({
    apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
  })

  const migratedCommits: EvalCommitV2[] = []
  const failedCommits: Array<{ sha: string; error: string }> = []

  const processCommit = async (
    oldCommit: EvalCommit,
    index: number,
  ): Promise<EvalCommitV2 | null> => {
    console.log(
      `\n[${index + 1}/${oldEvalData.evalCommits.length}] Processing commit ${oldCommit.sha.slice(0, 8)}...`,
    )

    try {
      return await migrateCommit(
        oldCommit,
        oldEvalData.repoUrl,
        client,
        localAgentDefinitions,
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.error(
        `Error migrating commit ${oldCommit.sha.slice(0, 8)}:`,
        errorMessage,
      )
      failedCommits.push({
        sha: oldCommit.sha,
        error: errorMessage,
      })
      return null
    }
  }

  const results = await mapLimit(
    oldEvalData.evalCommits,
    batchSize,
    async (commit: EvalCommit) => {
      const index = oldEvalData.evalCommits.indexOf(commit)
      return processCommit(commit, index)
    },
  )

  migratedCommits.push(...(results.filter(Boolean) as EvalCommitV2[]))

  console.log(
    `\n✓ Successfully migrated ${migratedCommits.length}/${oldEvalData.evalCommits.length} commits`,
  )

  if (failedCommits.length > 0) {
    console.log(`\n⚠ Failed to migrate ${failedCommits.length} commits:`)
    failedCommits.forEach((fc) => {
      console.log(`  - ${fc.sha.slice(0, 8)}: ${fc.error}`)
    })
  }

  const newEvalData: EvalDataV2 = {
    repoUrl: oldEvalData.repoUrl,
    testRepoName: oldEvalData.testRepoName,
    generationDate: new Date().toISOString(),
    initCommand: oldEvalData.initCommand,
    evalCommits: migratedCommits,
  }

  const finalOutputPath = outputPath || inputPath.replace(/\.json$/, '-v2.json')

  fs.writeFileSync(finalOutputPath, JSON.stringify(newEvalData, null, 2))

  const oldSize = fs.statSync(inputPath).size
  const newSize = fs.statSync(finalOutputPath).size

  console.log(`\n=== Migration Complete ===`)
  console.log(`Output file: ${finalOutputPath}`)
  console.log(`Original size: ${(oldSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`New size: ${(newSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(
    `Storage reduction: ${(((oldSize - newSize) / oldSize) * 100).toFixed(1)}%`,
  )
  console.log(`Successful migrations: ${migratedCommits.length}`)
  console.log(`Failed migrations: ${failedCommits.length}`)

  if (failedCommits.length > 0) {
    const failedCommitsPath = finalOutputPath.replace(/\.json$/, '-failed.json')
    fs.writeFileSync(failedCommitsPath, JSON.stringify(failedCommits, null, 2))
    console.log(`\nFailed commits logged to: ${failedCommitsPath}`)
  }
}

if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(
      'Usage: bun run migrate-evals-to-v2.ts <input-file> [output-file]',
    )
    console.log('')
    console.log('Examples:')
    console.log(
      '  bun run migrate-evals-to-v2.ts evals/git-evals/eval-codebuff.json',
    )
    console.log(
      '  bun run migrate-evals-to-v2.ts eval-manifold.json eval-manifold-v2.json',
    )
    console.log('')
    console.log(
      'Note: If output-file is not specified, it will append -v2 to the input filename',
    )
    process.exit(1)
  }

  const inputPath = args[0]
  const outputPath = args[1]

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`)
    process.exit(1)
  }

  migrateEvalFile({
    inputPath,
    outputPath,
    batchSize: 3,
  })
    .then(() => {
      console.log('\n✓ Migration completed successfully!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n✗ Migration failed:', error)
      process.exit(1)
    })
}
