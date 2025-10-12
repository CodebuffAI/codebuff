import { execSync } from 'child_process'
import { createTwoFilesPatch } from 'diff'
import fs from 'fs'
import path from 'path'

import { disableLiveUserInputCheck } from '@codebuff/backend/live-user-inputs'
import { promptAiSdk } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { models } from '@codebuff/common/old-constants'
import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import { mapLimit } from 'async'

import { CodebuffClient } from '../../sdk/src/client'
import { extractRepoNameFromUrl } from '../git-evals/setup-test-repo'
import { withTestRepoAndParent } from '../subagents/test-repo-utils'
import { generatePromptFromCommit } from './prompt-generator'

import type { EvalDataV2, EvalCommitV2, FileDiff } from './types'

const SPEC_GENERATION_PROMPT = `Given a set of file changes and an optional description, write a clear specification describing WHAT needs to be implemented.
First, use <thinking> tags to analyze the changes and determine what should go into the spec.

Then, generate the spec.

The spec should:
1. Focus on the observable behavior or structure that needs to be implemented
2. Not include implementation details or specific code
3. Not prescribe HOW to make the change
4. Be clear enough that a skilled developer or AI could implement it from scratch
5. Be phrased as what needs to be done, not what was already done
6. Cover all the changes shown across multiple files

The spec will be used to test an AI coding assistant's ability to implement the described functionality.

Please wrap your final specification in <spec></spec> tags.`

const fingerprintId = 'evals-v2'
const userInputId = 'evals-v2'

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

async function generateSpecForFileDiffs(
  fileDiffs: FileDiff[],
  clientSessionId: string,
): Promise<string> {
  const fileContext = fileDiffs
    .map(({ path, status, diff }) => {
      let diffDescription = `File: ${path}\n`

      if (status === 'added') {
        diffDescription += `New file created\n${diff}\n`
      } else if (status === 'deleted') {
        diffDescription += `File deleted\n${diff}\n`
      } else if (status === 'renamed') {
        diffDescription += `File renamed\n${diff}\n`
      } else {
        diffDescription += `${diff}\n`
      }

      return diffDescription
    })
    .join('\n---\n')

  const prompt = `${SPEC_GENERATION_PROMPT}\n\nFile Changes:\n${fileContext}`

  try {
    disableLiveUserInputCheck()
    const response = await promptAiSdk({
      messages: [{ role: 'user', content: prompt }],
      model: models.openrouter_claude_sonnet_4,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId: undefined,
      logger: console,
    })

    const specMatch = response.match(/<spec>(.*?)<\/spec>/s)
    const spec = specMatch ? specMatch[1].trim() : response.trim()

    return spec || 'Failed to generate specification'
  } catch (error) {
    console.error('Error generating spec:', error)
    return 'Failed to generate specification due to error'
  }
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

  const clientSessionId = `gen-evals-v2-${Math.random().toString(36).substring(2)}`

  console.log(`Processing ${commitShas.length} commits in parallel...`)

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
        const spec = await generateSpecForFileDiffs(fileDiffs, clientSessionId)

        console.log(
          `Generated spec for ${commitSha.slice(0, 8)}: ${spec.substring(0, 100)}...`,
        )

        const fullDiff = getFullDiff(repoPath, commitSha, parentSha)
        const commitMessage = getCommitMessage(repoPath, commitSha)
        const editedFilePaths = fileDiffs.map((f) => f.path)

        console.log(`Generating prompt for ${commitSha.slice(0, 8)}...`)
        const promptResult = await generatePromptFromCommit({
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

        console.log(
          `Generated prompt: ${promptResult.prompt.substring(0, 100)}...`,
        )
        console.log(
          `Supplemental files: ${promptResult.supplementalFiles.length} files`,
        )

        return {
          sha: commitSha,
          parentSha,
          spec,
          prompt: promptResult.prompt,
          supplementalFiles: promptResult.supplementalFiles,
          fileDiffs,
        }
      },
    )
  }

  const batchResults = await mapLimit(commitShas, BATCH_SIZE, processCommit)
  evalCommits.push(...(batchResults.filter(Boolean) as EvalCommitV2[]))

  const evalData: EvalDataV2 = {
    repoUrl,
    generationDate: new Date().toISOString(),
    evalCommits,
  }

  const generatedOutputPath =
    outputPath || path.join(__dirname, `eval-${actualRepoName}-v2.json`)

  fs.writeFileSync(generatedOutputPath, JSON.stringify(evalData, null, 2))
  console.log(`Eval data written to ${generatedOutputPath}`)
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
