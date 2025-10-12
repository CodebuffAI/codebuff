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

      console.log(`\n--- Generated Task Result ---`)
      console.log(`Task ID: ${taskResult.id}`)
      console.log(`\nReasoning:`)
      console.log(taskResult.reasoning)
      console.log(`\nSpec:`)
      console.log(taskResult.spec)
      console.log(`\nPrompt:`)
      console.log(taskResult.prompt)
      console.log(`\nSupplemental Files (${taskResult.supplementalFiles.length}):`)  
      taskResult.supplementalFiles.forEach((file, i) => {
        console.log(`  ${i + 1}. ${file}`)
      })
      console.log(`--- End Task Result ---\n`)

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
  resume = false,
}: {
  inputPath: string
  outputPath?: string
  batchSize?: number
  resume?: boolean
}): Promise<void> {
  console.log(`\n=== Migrating ${inputPath} to V2 format ===\n`)

  const oldEvalData: EvalData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))

  const finalOutputPath = outputPath || inputPath.replace(/\.json$/, '-v2.json')
  const failedCommitsPath = finalOutputPath.replace(/\.json$/, '-failed.json')

  let existingCommits: EvalCommitV2[] = []
  let failedShas: Set<string> = new Set()
  let commitsToProcess = oldEvalData.evalCommits

  if (resume) {
    if (fs.existsSync(finalOutputPath)) {
      const existingData: EvalDataV2 = JSON.parse(
        fs.readFileSync(finalOutputPath, 'utf-8'),
      )
      existingCommits = existingData.evalCommits
      console.log(`Found ${existingCommits.length} existing migrated commits`)
    }

    if (fs.existsSync(failedCommitsPath)) {
      const failedCommits: Array<{ sha: string; error: string }> = JSON.parse(
        fs.readFileSync(failedCommitsPath, 'utf-8'),
      )
      failedShas = new Set(failedCommits.map((fc) => fc.sha))
      console.log(`Found ${failedShas.size} failed commits to retry`)

      commitsToProcess = oldEvalData.evalCommits.filter((commit) =>
        failedShas.has(commit.sha),
      )
    } else {
      console.log('No failed commits file found, nothing to resume')
      return
    }
  }

  console.log(`Found ${commitsToProcess.length} commits to process`)
  console.log(`Repo URL: ${oldEvalData.repoUrl}`)

  const agentsPath = path.join(__dirname, '../../.agents')
  const localAgentDefinitions = Object.values(
    await loadLocalAgents({ agentsPath }),
  )

  const client = new CodebuffClient({
    apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
  })

  const newlyMigratedCommits: EvalCommitV2[] = []
  const failedCommits: Array<{ sha: string; error: string }> = []

  const partialOutputPath = finalOutputPath.replace(/\.json$/, '.partial.json')

  const processCommit = async (
    oldCommit: EvalCommit,
    index: number,
  ): Promise<EvalCommitV2 | null> => {
    console.log(
      `\n[${index + 1}/${oldEvalData.evalCommits.length}] Processing commit ${oldCommit.sha.slice(0, 8)}...`,
    )

    try {
      const result = await migrateCommit(
        oldCommit,
        oldEvalData.repoUrl,
        client,
        localAgentDefinitions,
      )

      if (result) {
        newlyMigratedCommits.push(result)

        const allCommits = resume
          ? mergeCommits(existingCommits, newlyMigratedCommits, oldEvalData)
          : newlyMigratedCommits

        const partialData: EvalDataV2 = {
          repoUrl: oldEvalData.repoUrl,
          testRepoName: oldEvalData.testRepoName,
          generationDate: new Date().toISOString(),
          initCommand: oldEvalData.initCommand,
          evalCommits: allCommits,
        }
        fs.writeFileSync(partialOutputPath, JSON.stringify(partialData, null, 2))
        console.log(`✓ Saved partial results to ${partialOutputPath}`)
      }

      return result
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

  await mapLimit(
    commitsToProcess,
    batchSize,
    async (commit: EvalCommit) => {
      const index = oldEvalData.evalCommits.indexOf(commit)
      return processCommit(commit, index)
    },
  )

  const allCommits = resume
    ? mergeCommits(existingCommits, newlyMigratedCommits, oldEvalData)
    : newlyMigratedCommits

  const successfulRetries = resume ? newlyMigratedCommits.length : 0
  const totalProcessed = resume
    ? existingCommits.length + successfulRetries
    : newlyMigratedCommits.length

  console.log(
    `\n✓ Successfully migrated ${totalProcessed}/${oldEvalData.evalCommits.length} commits`,
  )
  if (resume && successfulRetries > 0) {
    console.log(`  - ${successfulRetries} previously failed commits now successful`)
  }

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
    evalCommits: allCommits,
  }

  fs.writeFileSync(finalOutputPath, JSON.stringify(newEvalData, null, 2))

  if (fs.existsSync(partialOutputPath)) {
    fs.unlinkSync(partialOutputPath)
    console.log(`\n✓ Removed partial file: ${partialOutputPath}`)
  }

  const oldSize = fs.statSync(inputPath).size
  const newSize = fs.statSync(finalOutputPath).size

  console.log(`\n=== Migration Complete ===`)
  console.log(`Output file: ${finalOutputPath}`)
  console.log(`Original size: ${(oldSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`New size: ${(newSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(
    `Storage reduction: ${(((oldSize - newSize) / oldSize) * 100).toFixed(1)}%`,
  )
  console.log(`Successful migrations: ${allCommits.length}`)
  console.log(`Failed migrations: ${failedCommits.length}`)

  if (resume) {
    console.log(`Previous successful: ${existingCommits.length}`)
    console.log(`Newly successful: ${successfulRetries}`)
  }

  if (failedCommits.length > 0) {
    fs.writeFileSync(failedCommitsPath, JSON.stringify(failedCommits, null, 2))
    console.log(`\nFailed commits logged to: ${failedCommitsPath}`)
  } else if (fs.existsSync(failedCommitsPath)) {
    fs.unlinkSync(failedCommitsPath)
    console.log(`\n✓ All commits successful, removed failed commits file`)
  }
}

function mergeCommits(
  existing: EvalCommitV2[],
  newCommits: EvalCommitV2[],
  originalData: EvalData,
): EvalCommitV2[] {
  const commitMap = new Map<string, EvalCommitV2>()

  for (const commit of existing) {
    commitMap.set(commit.sha, commit)
  }

  for (const commit of newCommits) {
    commitMap.set(commit.sha, commit)
  }

  return originalData.evalCommits
    .map((c) => commitMap.get(c.sha))
    .filter((c): c is EvalCommitV2 => c !== undefined)
}

if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(
      'Usage: bun run migrate-evals-to-v2.ts <input-file> [output-file] [--resume]',
    )
    console.log('')
    console.log('Examples:')
    console.log(
      '  bun run migrate-evals-to-v2.ts evals/git-evals/eval-codebuff.json',
    )
    console.log(
      '  bun run migrate-evals-to-v2.ts eval-manifold.json eval-manifold-v2.json',
    )
    console.log(
      '  bun run migrate-evals-to-v2.ts eval-codebuff.json --resume',
    )
    console.log('')
    console.log(
      'Note: If output-file is not specified, it will append -v2 to the input filename',
    )
    console.log(
      'Use --resume flag to retry only failed commits from a previous run',
    )
    process.exit(1)
  }

  const resume = args.includes('--resume')
  const nonFlagArgs = args.filter((arg) => arg !== '--resume')
  const inputPath = nonFlagArgs[0]
  const outputPath = nonFlagArgs[1]

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`)
    process.exit(1)
  }

  migrateEvalFile({
    inputPath,
    outputPath,
    batchSize: 3,
    resume,
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
