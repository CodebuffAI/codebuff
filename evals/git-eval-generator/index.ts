import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

import { claudeModels, geminiModels } from 'common/src/constants'
import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { COMMIT_SELECTION_PROMPT, SPEC_GENERATION_PROMPT } from './prompts'
import { CommitInfo, EvalCommit, GitRepoEvalData } from './types'
import { chunk } from 'lodash'

const CommitSelectionSchema = z.object({
  commits: z.array(
    z.object({
      sha: z.string(),
      reason: z.string(),
    })
  ),
})

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
        response.commits.some((s) => commit.sha.startsWith(s.sha))
      )
      .map((commit) => ({
        ...commit,
        selectionReason: response.commits.find((s) =>
          commit.sha.startsWith(s.sha)
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
): Promise<string> {
  // Get list of files changed in this commit
  const filesCommand = `git show --name-only --pretty=format:"" ${commit.sha}`
  const changedFiles = execSync(filesCommand, { cwd: repoPath })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)

  // Get the content of each file before the commit
  const preCommitFiles: Record<string, string> = {}
  for (const file of changedFiles) {
    try {
      // Get content from parent commit (commit^)
      const fileCommand = `git show ${commit.sha}^:${file}`
      const content = execSync(fileCommand, { cwd: repoPath }).toString()
      preCommitFiles[file] = content
    } catch (e) {
      // File might not exist in parent commit (new file)
      preCommitFiles[file] = '[NEW FILE]'
    }
  }

  // Get the full commit diff
  const diffCommand = `git show ${commit.sha}`
  const diff = execSync(diffCommand, { cwd: repoPath }).toString()

  // Build the prompt with pre-commit file contents
  const preCommitContext = Object.entries(preCommitFiles)
    .map(
      ([file, content]) => `File: ${file}\nPre-commit content:\n${content}\n`
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
  return spec
}

export async function generateEvalFile({
  repoPath,
  outputPath,
  clientSessionId,
  numberOfCommits,
}: {
  repoPath: string
  outputPath: string
  clientSessionId: string
  numberOfCommits: number
}): Promise<void> {
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
    const specs = await Promise.all(
      commitChunk.map((commit) =>
        generateSpecForCommit(commit, repoPath, clientSessionId)
      )
    )
    console.log('Generated specs:', specs)
    evalCommits.push(
      ...commitChunk.map((commit, index) => ({ ...commit, spec: specs[index] }))
    )
  }

  // Create output data
  const evalData: GitRepoEvalData = {
    repoPath,
    generationDate: new Date().toISOString(),
    evalCommits: evalCommits,
  }

  // Write to file
  fs.writeFileSync(outputPath, JSON.stringify(evalData, null, 2))
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error('Usage: bun run generate-git-evals <repo-path> [output-path]')
    process.exit(1)
  }

  const repoPath = args[0]
  const outputPath = args[1] || './git-evals.json'
  const numberOfCommits = Number(args[2] || 100)

  // Generate random ID for this run
  const sessionId = Math.random().toString(36).substring(2)

  generateEvalFile({
    repoPath,
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
