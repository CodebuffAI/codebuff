import { execSync } from 'child_process'
import { createTwoFilesPatch } from 'diff'
import fs from 'fs'
import path from 'path'
import { mapLimit } from 'async'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserCredentials } from '@codebuff/npm-app/credentials'

import { CodebuffClient } from '../../sdk/src/client'
import { extractRepoNameFromUrl } from '../git-evals/setup-test-repo'
import { withTestRepoAndParent } from '../subagents/test-repo-utils'
import { generateEvalTask } from './eval-task-generator'

import type { EvalDataV2, EvalCommitV2, FileDiff } from './types'

function getFileContentAtCommit(
  repoPath: string,
  commitSha: string,
  filePath: string,
): string {
  try {
    return execSync(`git show ${commitSha}:${JSON.stringify(filePath)}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    })
  } catch (error) {
    return ''
  }
}

async function extractFileDiffsFromCommit(
  repoPath: string,
  commitSha: string,
  parentSha: string,
): Promise<FileDiff[]> {
  const fileDiffs: FileDiff[] = []

  const filesOutput = execSync(
    `git diff --name-status ${parentSha} ${commitSha}`,
    { cwd: repoPath, encoding: 'utf-8' },
  )

  const lines = filesOutput.trim().split('\n').filter(Boolean)

  for (const line of lines) {
    const [status, ...pathParts] = line.split('\t')
    const filePath = pathParts[pathParts.length - 1]

    let statusType: FileDiff['status'] = 'modified'
    let oldPath: string | undefined

    if (status === 'A') {
      statusType = 'added'
    } else if (status === 'D') {
      statusType = 'deleted'
    } else if (status.startsWith('R')) {
      statusType = 'renamed'
      oldPath = pathParts[0]
    }

    const oldContent = getFileContentAtCommit(
      repoPath,
      parentSha,
      oldPath || filePath,
    )
    const newContent = getFileContentAtCommit(repoPath, commitSha, filePath)

    const diff = createTwoFilesPatch(
      oldPath || filePath,
      filePath,
      oldContent,
      newContent,
      `${parentSha.slice(0, 7)} (parent)`,
      `${commitSha.slice(0, 7)} (commit)`,
    )

    fileDiffs.push({
      path: filePath,
      status: statusType,
      oldPath,
      diff,
    })
  }

  return fileDiffs
}

function getFullDiff(
  repoPath: string,
  commitSha: string,
  parentSha: string,
): string {
  return execSync(`git diff ${parentSha} ${commitSha}`, {
    cwd: repoPath,
    encoding: 'utf-8',
  })
}

function getCommitMessage(repoPath: string, commitSha: string): string {
  return execSync(`git log --format=%B -n 1 ${commitSha}`, {
    cwd: repoPath,
    encoding: 'utf-8',
  }).trim()
}

function printTaskResult(taskResult: {
  id: string
  reasoning: string
  spec: string
  prompt: string
  supplementalFiles: string[]
}) {
  console.log('\n' + '='.repeat(80))
  console.log('📋 GENERATED TASK')
  console.log('='.repeat(80))
  console.log(`\n🏷️  Task ID: ${taskResult.id}\n`)
  console.log(`💭 Reasoning:\n${taskResult.reasoning}\n`)
  console.log(`📝 Spec:\n${taskResult.spec}\n`)
  console.log(`💬 Prompt:\n${taskResult.prompt}\n`)
  console.log(`📁 Supplemental Files (${taskResult.supplementalFiles.length}):`)
  taskResult.supplementalFiles.forEach((file, idx) => {
    console.log(`   ${idx + 1}. ${file}`)
  })
  console.log('='.repeat(80) + '\n')
}

function savePartialResults(partialPath: string, evalData: EvalDataV2): void {
  fs.writeFileSync(partialPath, JSON.stringify(evalData, null, 2))
  console.log(`💾 Saved partial results to ${partialPath}`)
}

export async function generateEvalFileV2({
  repoUrl,
  commitShas,
  outputPath,
}: {
  repoUrl: string
  commitShas: string[]
  outputPath?: string
}): Promise<void> {
  const actualRepoName = extractRepoNameFromUrl(repoUrl)

  const client = new CodebuffClient({
    apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
  })

  const finalOutputPath =
    outputPath || path.join(__dirname, `eval-${actualRepoName}-v2.json`)
  const partialOutputPath = finalOutputPath.replace(/\.json$/, '.partial.json')

  console.log(`Processing ${commitShas.length} commits in parallel...`)
  console.log(`Partial results will be saved to: ${partialOutputPath}`)
  console.log(`Final results will be saved to: ${finalOutputPath}\n`)

  const BATCH_SIZE = 5
  const evalCommits: EvalCommitV2[] = []

  const processCommit = async (
    commitSha: string,
  ): Promise<EvalCommitV2 | null> => {
    console.log(`Processing commit ${commitSha.slice(0, 8)}...`)

    return await withTestRepoAndParent(
      {
        repoUrl,
        commitSha,
        initCommand: undefined,
      },
      async (repoPath, commitSha, parentSha) => {
        const fileDiffs = await extractFileDiffsFromCommit(
          repoPath,
          commitSha,
          parentSha,
        )

        const fullDiff = getFullDiff(repoPath, commitSha, parentSha)
        const commitMessage = getCommitMessage(repoPath, commitSha)
        const editedFilePaths = fileDiffs.map((f) => f.path)

        console.log(`Generating eval task for ${commitSha.slice(0, 8)}...`)
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
        })

        printTaskResult(taskResult)

        const evalCommit: EvalCommitV2 = {
          id: taskResult.id,
          sha: commitSha,
          parentSha,
          spec: taskResult.spec,
          prompt: taskResult.prompt,
          supplementalFiles: taskResult.supplementalFiles,
          fileDiffs,
        }

        return evalCommit
      },
    )
  }

  const batchResults = await mapLimit(
    commitShas,
    BATCH_SIZE,
    async (commitSha: string) => {
      const result = await processCommit(commitSha)
      if (result) {
        evalCommits.push(result)

        const partialEvalData: EvalDataV2 = {
          repoUrl,
          generationDate: new Date().toISOString(),
          evalCommits: [...evalCommits],
        }
        savePartialResults(partialOutputPath, partialEvalData)
      }
      return result
    },
  )

  const evalData: EvalDataV2 = {
    repoUrl,
    generationDate: new Date().toISOString(),
    evalCommits,
  }

  fs.writeFileSync(finalOutputPath, JSON.stringify(evalData, null, 2))
  console.log(`\n✅ Eval data written to ${finalOutputPath}`)

  if (fs.existsSync(partialOutputPath)) {
    fs.unlinkSync(partialOutputPath)
    console.log(`🗑️  Removed partial file: ${partialOutputPath}`)
  }
}

if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(
      'Usage: bun run gen-evals.ts <repo-url> <commit-sha1> [commit-sha2] ...',
    )
    console.log('')
    console.log('Examples:')
    console.log(
      '  bun run gen-evals.ts https://github.com/user/repo abc123 def456',
    )
    process.exit(1)
  }

  const repoUrl = args[0]
  const commitShas = args.slice(1)

  if (!repoUrl || commitShas.length === 0) {
    console.error('Error: repo-url and at least one commit SHA are required')
    process.exit(1)
  }

  generateEvalFileV2({
    repoUrl,
    commitShas,
  })
    .then(() => console.log('Eval file generation completed'))
    .catch(console.error)
}
