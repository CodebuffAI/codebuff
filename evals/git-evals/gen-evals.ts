import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { chunk } from 'lodash'
import { z } from 'zod'

import { claudeModels, geminiModels } from 'common/src/constants'
import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { COMMIT_SELECTION_PROMPT, SPEC_GENERATION_PROMPT } from './prompts'
import {
  CommitInfo,
  CommitSelectionSchema,
  EvalCommit,
  GitRepoEvalData,
  CommitFileState,
} from './types'

const fingerprintId = 'evals'
const userInputId = 'evals'

function getCommits(repoPath: string, limit: number): CommitInfo[] {
  const gitLogCommand = `git log --pretty=format:"%H|%an|%ad|%s" --date=iso -n ${limit}`
  const gitLogOutput = execSync(gitLogCommand, { cwd: repoPath }).toString()

  // Filter out empty lines to handle trailing newlines
  const lines = gitLogOutput.split('\n').filter((line) => line.trim() !== '')

  return lines.map((line) => {
    const [sha, author, date, ...messageParts] = line.split('|')
    const message = messageParts.join('|') // Rejoin message parts in case it contained |

    // Get stats for this commit
    const statsCommand = `git show --stat ${sha}`
    const statsOutput = execSync(statsCommand, { cwd: repoPath }).toString()
    const stats = parseGitStats(statsOutput)

    return {
      sha,
      author,
      date,
      message,
      stats,
    }
  })
}

function parseGitStats(statsOutput: string): {
  filesChanged: number
  insertions: number
  deletions: number
} {
  // Example stats line:
  // " 2 files changed, 25 insertions(+), 12 deletions(-)"
  const statsLine = statsOutput
    .split('\n')
    .find((line) => line.includes('files changed'))

  if (!statsLine) {
    return { filesChanged: 0, insertions: 0, deletions: 0 }
  }

  const filesChanged = parseInt(
    statsLine.match(/(\d+) files? changed/)?.[1] || '0'
  )
  const insertions = parseInt(statsLine.match(/(\d+) insertions?/)?.[1] || '0')
  const deletions = parseInt(statsLine.match(/(\d+) deletions?/)?.[1] || '0')

  return { filesChanged, insertions, deletions }
}

async function selectSubstantialCommits(
  commits: CommitInfo[],
  clientSessionId: string
): Promise<Array<CommitInfo & { selectionReason: string }>> {
  const commitsInfo = commits
    .map(
      (c) =>
        `${c.sha.substring(0, 8)}: ${c.message}\n` +
        `Author: ${c.author}, Date: ${c.date}\n` +
        `Stats: ${c.stats.filesChanged} files changed, +${c.stats.insertions} -${c.stats.deletions}\n`
    )
    .join('\n\n')

  const prompt = `${COMMIT_SELECTION_PROMPT}\n\nCommits to evaluate:\n\n${commitsInfo}`

  const response = await promptAiSdkStructured(
    [{ role: 'user', content: prompt }],
    {
      schema: CommitSelectionSchema,
      model: claudeModels.sonnet,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId: undefined,
    }
  )

  try {
    return commits
      .filter((commit) =>
        response.commits.some((selected: { sha: string }) => commit.sha.startsWith(selected.sha))
      )
      .map((commit) => ({
        ...commit,
        selectionReason: response.commits.find((selected: { sha: string; reason: string }) =>
          commit.sha.startsWith(selected.sha)
        )!.reason,
      }))
  } catch (e) {
    console.error('Failed to parse commit selection response:', e)
    return []
  }
}

async function generateSpecForCommit(
  commit: CommitInfo & { selectionReason: string },
  repoPath: string,
  clientSessionId: string
): Promise<{ spec: string; fileStates: CommitFileState[] }> {
  // Get list of files changed in this commit
  const filesCommand = `git show --name-only --pretty=format:"" ${commit.sha}`
  const changedFiles = execSync(filesCommand, { cwd: repoPath })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)

  // Get the content of each file before and after the commit
  const fileStates: CommitFileState[] = []
  for (const file of changedFiles) {
    try {
      // Get content from parent commit (commit^)
      const preCommand = `git show ${commit.sha}^:${file}`
      const preContent = execSync(preCommand, { cwd: repoPath }).toString()
      
      // Get content after commit
      const postCommand = `git show ${commit.sha}:${file}`
      const postContent = execSync(postCommand, { cwd: repoPath }).toString()

      fileStates.push({
        path: file,
        preContent,
        postContent
      })
    } catch (e) {
      // File might not exist in parent commit (new file)
      // Or might be deleted in this commit
      const isNewFile = !execSync(`git show ${commit.sha}^:${file} 2>/dev/null || true`, { cwd: repoPath }).toString()
      const isDeletedFile = !execSync(`git show ${commit.sha}:${file} 2>/dev/null || true`, { cwd: repoPath }).toString()
      
      fileStates.push({
        path: file,
        preContent: isNewFile ? '[NEW FILE]' : execSync(`git show ${commit.sha}^:${file}`, { cwd: repoPath }).toString(),
        postContent: isDeletedFile ? '[DELETED]' : execSync(`git show ${commit.sha}:${file}`, { cwd: repoPath }).toString()
      })
    }
  }

  // Get the full commit diff for context
  const diffCommand = `git show ${commit.sha}`
  const diff = execSync(diffCommand, { cwd: repoPath }).toString()

  // Build the prompt with pre-commit file contents
  const preCommitContext = fileStates
    .map(
      ({ path, preContent }) => `File: ${path}\nPre-commit content:\n${preContent}\n`
    )
    .join('\n---\n')

  const prompt = `${SPEC_GENERATION_PROMPT}

Pre-commit files:
${preCommitContext}

Commit Message: ${commit.message}

Changes Made:
${diff}`

  const { spec } = await promptAiSdkStructured(
    [{ role: 'user', content: prompt }],
    {
      schema: z.object({ spec: z.string() }),
      model: geminiModels.gemini2_5_pro_preview,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId: undefined,
    }
  )
  return { spec, fileStates }
}

export async function generateEvalFile({
  testRepoName,
  outputPath,
  clientSessionId,
  numberOfCommits,
}: {
  testRepoName: string
  outputPath: string
  clientSessionId: string
  numberOfCommits: number
}): Promise<void> {
  const repoPath = path.join(__dirname, '../test-repos', testRepoName)
  // Validate repo path
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    throw new Error(`${repoPath} is not a git repository`)
  }

  // Get commits
  const commits = getCommits(repoPath, numberOfCommits)
  console.log(`Found ${commits.length} commits`)

  // Select substantial commits
  const selectedCommits = await selectSubstantialCommits(
    commits,
    clientSessionId
  )

  console.log('Selected commits:', selectedCommits)

  const chunkedCommits = chunk(selectedCommits, 5)

  // Generate specs for selected commits
  const evalCommits: EvalCommit[] = []
  for (const commitChunk of chunkedCommits) {
    const results = await Promise.all(
      commitChunk.map((commit) =>
        generateSpecForCommit(commit, repoPath, clientSessionId)
      )
    )
    console.log('Generated specs and captured file states')
    evalCommits.push(
      ...commitChunk.map((commit, index) => ({
        ...commit,
        spec: results[index].spec,
        fileStates: results[index].fileStates
      }))
    )
  }

  // Create output data
  const evalData: GitRepoEvalData = {
    testRepoName,
    generationDate: new Date().toISOString(),
    evalCommits: evalCommits,
  }

  // Write to file
  fs.writeFileSync(outputPath, JSON.stringify(evalData, null, 2))
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  console.info('Usage: bun run generate-git-evals <repo-name> [output-path]')

  const testRepoName = args[0] || 'codebuff'
  const outputPath = args[1] || './git-evals/git-evals.json'
  const numberOfCommits = Number(args[2] || 100)

  // Generate random ID for this run
  const sessionId = Math.random().toString(36).substring(2)

  generateEvalFile({
    testRepoName,
    outputPath,
    clientSessionId: sessionId,
    numberOfCommits,
  })
    .then(() => console.log(`Eval data written to ${outputPath}`))
    .catch((err) => {
      console.error('Error generating eval data:', err)
      process.exit(1)
    })
}
