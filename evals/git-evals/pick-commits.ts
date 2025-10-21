#!/usr/bin/env bun

import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { disableLiveUserInputCheck } from '@codebuff/agent-runtime/live-user-inputs'
import { promptAiSdkStructured } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { models } from '@codebuff/common/old-constants'
import { mapLimit } from 'async'
import { z } from 'zod/v4'

import { extractRepoNameFromUrl, setupTestRepo } from './setup-test-repo'

// Types for commit data
export interface CommitDiff {
  path: string
  preContent: string
  postContent: string
}

export interface CommitInfo {
  sha: string
  author: string
  date: string
  message: string
  stats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
}

export interface FilteredCommit extends CommitInfo {
  githubUrl: string
  reason: string
  shortDescription: string
}

export interface CommitPickerResult {
  repoUrl: string
  repoName: string
  generationDate: string
  totalCommitsScanned: number
  commitsAfterBasicFilter: number
  selectedCommits: FilteredCommit[]
}

// Schema for GPT-5 response
const CommitSelectionSchema = z.object({
  selectedCommits: z.array(
    z.object({
      sha: z.string(),
      reason: z.string(),
      shortDescription: z.string(),
    }),
  ),
})

const COMMIT_SCREENING_PROMPT = `You are an expert at identifying substantial and well-scoped code changes in git commits that would make good evaluation examples for an AI coding assistant.

Given a commit with its actual file changes and diffs, determine if it represents a substantial, complete, and clear change that would make a good coding task.

A good evaluation commit should:
1. Make a meaningful, self-contained change (not just typo fixes or formatting)
2. Have a clear purpose that can be described without implementation details
3. Represent work that a skilled developer could implement given a description
4. Show interesting coding patterns or solve real problems
5. Not be auto-generated, trivial refactoring, or pure dependency updates
6. Have reasonable scope (not too small like 1-line fixes, not too large like massive refactors)
7. Show coherent changes that work together toward a common goal
8. Demonstrate meaningful logic or functionality changes, not just cosmetic edits

Avoid commits that are:
- Dependency updates (package.json, lock files)
- Auto-generated code (generated files, build outputs)
- Pure formatting or linting changes
- Documentation-only changes (unless they involve code examples)
- Merge commits or reverts
- Trivial one-line fixes
- Mass renaming or file moves without logic changes
- Incoherent changes that seem unrelated or incomplete
- Changes that only modify comments or whitespace

When evaluating, pay special attention to:
- The actual code changes shown in the diffs
- Whether the changes form a coherent, complete feature or fix
- The complexity and educational value of the implementation
- Whether the changes would be implementable from a specification

For each commit you select:
- Provide a clear reason why it makes a good evaluation example
- Write a short description (1-2 sentences) of what the commit accomplishes
- Reference specific aspects of the code changes that make it valuable

Return your response as JSON with the selected commits.`

const fingerprintId = 'commit-picker'
const userInputId = 'commit-picker'

function getCommits(repoPath: string, limit: number): CommitInfo[] {
  const gitLogOutput = execFileSync(
    'git',
    [
      'log',
      '--pretty=format:%H|%an|%ad|%s',
      '--date=iso',
      '-n',
      limit.toString(),
    ],
    { cwd: repoPath, encoding: 'utf-8' },
  )

  const lines = gitLogOutput.split('\n').filter((line) => line.trim() !== '')

  return lines.map((line) => {
    const [sha, author, date, ...messageParts] = line.split('|')
    const message = messageParts.join('|')

    // Get stats for this commit
    const statsOutput = execFileSync('git', ['show', '--stat', sha], {
      cwd: repoPath,
      encoding: 'utf-8',
    })
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
  const statsLine = statsOutput
    .split('\n')
    .find((line) => line.includes('files changed'))

  if (!statsLine) {
    return { filesChanged: 0, insertions: 0, deletions: 0 }
  }

  const filesChanged = parseInt(
    statsLine.match(/(\d+) files? changed/)?.[1] || '0',
  )
  const insertions = parseInt(statsLine.match(/(\d+) insertions?/)?.[1] || '0')
  const deletions = parseInt(statsLine.match(/(\d+) deletions?/)?.[1] || '0')

  return { filesChanged, insertions, deletions }
}

async function generateDiffFromCommit(
  repoPath: string,
  commitSha: string,
): Promise<CommitDiff[]> {
  // Get list of files changed in this commit
  const changedFiles = execFileSync(
    'git',
    ['show', '--name-only', '--pretty=format:', commitSha],
    {
      cwd: repoPath,
    },
  )
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)

  // Limit number of files to avoid overwhelming the LLM
  const MAX_FILES_PER_COMMIT = 30
  const filesToProcess = changedFiles.slice(0, MAX_FILES_PER_COMMIT)

  if (changedFiles.length > MAX_FILES_PER_COMMIT) {
    console.log(
      `Commit ${commitSha}: Processing ${MAX_FILES_PER_COMMIT} of ${changedFiles.length} changed files`,
    )
  }

  // Get the content of each file before and after the commit
  const diffs: CommitDiff[] = []
  for (const file of filesToProcess) {
    try {
      // Get content from parent commit (commit^)
      const preContent = execFileSync(
        'git',
        ['show', `${commitSha}^:${file}`],
        {
          cwd: repoPath,
        },
      ).toString()

      // Get content after commit
      const postContent = execFileSync(
        'git',
        ['show', `${commitSha}:${file}`],
        {
          cwd: repoPath,
        },
      ).toString()

      diffs.push({
        path: file,
        preContent,
        postContent,
      })
    } catch (error) {
      // File might not exist in parent commit (new file) or might be deleted
      try {
        const postContent = execFileSync(
          'git',
          ['show', `${commitSha}:${file}`],
          {
            cwd: repoPath,
          },
        ).toString()
        diffs.push({
          path: file,
          preContent: '[NEW FILE]',
          postContent,
        })
      } catch {
        try {
          const preContent = execFileSync(
            'git',
            ['show', `${commitSha}^:${file}`],
            {
              cwd: repoPath,
            },
          ).toString()
          diffs.push({
            path: file,
            preContent,
            postContent: '[DELETED]',
          })
        } catch {
          console.warn(`Could not process file ${file} for commit ${commitSha}`)
        }
      }
    }
  }

  return diffs
}

function basicFilter(commits: CommitInfo[]): CommitInfo[] {
  return commits.filter((commit) => {
    const { message, stats } = commit
    const lowerMessage = message.toLowerCase()

    // Filter out obvious non-candidates
    if (
      // Dependency updates
      lowerMessage.includes('update dependencies') ||
      lowerMessage.includes('bump ') ||
      (lowerMessage.includes('upgrade ') && lowerMessage.includes('version')) ||
      // Auto-generated
      lowerMessage.includes('auto-generated') ||
      lowerMessage.includes('generated by') ||
      // Build/CI changes
      lowerMessage.includes('ci:') ||
      lowerMessage.includes('build:') ||
      // Formatting/linting
      (lowerMessage.includes('format') && lowerMessage.includes('code')) ||
      lowerMessage.includes('lint') ||
      lowerMessage.includes('prettier') ||
      // Merge commits
      lowerMessage.startsWith('merge ') ||
      // Reverts
      lowerMessage.startsWith('revert ') ||
      // Documentation only (unless it's substantial)
      (lowerMessage.includes('readme') && stats.filesChanged <= 1) ||
      (lowerMessage.includes('docs:') && stats.filesChanged <= 2)
    ) {
      return false
    }

    // Filter by stats - too small or too large
    if (
      stats.filesChanged === 0 ||
      (stats.filesChanged <= 1 && stats.insertions + stats.deletions < 5) ||
      stats.filesChanged > 50 || // Massive changes
      stats.insertions + stats.deletions > 2000 // Huge diffs
    ) {
      return false
    }

    return true
  })
}

export function createGithubUrl(repoUrl: string, sha: string): string {
  // Convert repo URL to GitHub commit URL
  let baseUrl = repoUrl
  if (baseUrl.endsWith('.git')) {
    baseUrl = baseUrl.slice(0, -4)
  }
  if (baseUrl.startsWith('git@github.com:')) {
    baseUrl = baseUrl.replace('git@github.com:', 'https://github.com/')
  }
  return `${baseUrl}/commit/${sha}`
}

async function screenCommitsWithGpt5(
  commits: CommitInfo[],
  repoUrl: string,
  repoPath: string,
  clientSessionId: string,
): Promise<FilteredCommit[]> {
  const selectedCommits: FilteredCommit[] = []
  const concurrency = 8

  // Process each commit individually
  async function processCommit(
    commit: CommitInfo,
    index: number,
  ): Promise<FilteredCommit | null> {
    console.log(
      `Screening commit ${index + 1}/${commits.length}: ${commit.sha.substring(0, 8)}...`,
    )

    // Get detailed commit information including diffs
    let diffs: CommitDiff[] = []
    try {
      diffs = await generateDiffFromCommit(repoPath, commit.sha)
    } catch (error) {
      console.warn(`Failed to get diffs for commit ${commit.sha}:`, error)
    }

    let commitInfo =
      `${commit.sha.substring(0, 8)}: ${commit.message}\n` +
      `Author: ${commit.author}, Date: ${commit.date}\n` +
      `Stats: ${commit.stats.filesChanged} files changed, +${commit.stats.insertions} -${commit.stats.deletions}\n`

    if (diffs.length > 0) {
      commitInfo += `\nFile Changes:\n`
      for (const diff of diffs) {
        commitInfo += `\n--- ${diff.path} ---\n`

        if (diff.preContent === '[NEW FILE]') {
          commitInfo += `New file:\n${diff.postContent}\n`
        } else if (diff.postContent === '[DELETED]') {
          commitInfo += `File deleted\n`
        } else {
          // Show a simplified diff for existing files
          const preLines = diff.preContent.split('\n')
          const postLines = diff.postContent.split('\n')

          let hasChanges = false
          for (let i = 0; i < preLines.length; i++) {
            if (preLines[i] !== postLines[i]) {
              commitInfo += `Line ${i + 1}:\n- ${preLines[i]}\n+ ${postLines[i]}\n`
              hasChanges = true
            }
          }

          if (!hasChanges && preLines.length !== postLines.length) {
            commitInfo += `File length changed from ${preLines.length} to ${postLines.length} lines\n`
          }
        }
      }
    }

    const prompt = `${COMMIT_SCREENING_PROMPT}\n\nCommit to evaluate:\n\n${commitInfo}`

    try {
      disableLiveUserInputCheck()
      const response = await promptAiSdkStructured({
        messages: [{ role: 'user', content: prompt }],
        schema: CommitSelectionSchema,
        model: models.openrouter_gpt5,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId: undefined,
        sendAction: () => {},
        liveUserInputRecord: {},
        sessionConnections: {},
        logger: console,
        trackEvent: () => {},
      })

      // Handle empty or invalid response
      if (
        !response ||
        !response.selectedCommits ||
        !Array.isArray(response.selectedCommits) ||
        response.selectedCommits.length === 0
      ) {
        console.log(`Commit ${commit.sha.substring(0, 8)} not selected`)
        return null
      }

      // Since we're processing one commit at a time, there should only be one result
      const selected = response.selectedCommits[0]
      if (!selected || !commit.sha.startsWith(selected.sha)) {
        console.log(`Commit ${commit.sha.substring(0, 8)} not selected`)
        return null
      }

      console.log(`✓ Selected commit ${commit.sha.substring(0, 8)}`)
      return {
        ...commit,
        githubUrl: createGithubUrl(repoUrl, commit.sha),
        reason: selected.reason,
        shortDescription: selected.shortDescription,
      }
    } catch (error) {
      console.error(
        `Error screening commit ${commit.sha.substring(0, 8)}:`,
        error,
      )
      return null
    }
  }

  // Process commits with limited concurrency using mapLimit
  const results = await mapLimit(
    commits,
    concurrency,
    async (commit: CommitInfo) => {
      const index = commits.indexOf(commit)
      return processCommit(commit, index)
    },
  )

  results.forEach((result) => {
    if (result) selectedCommits.push(result)
  })

  return selectedCommits
}
export async function pickCommits({
  repoUrl,
  outputPath,
  clientSessionId,
  limit = 200,
}: {
  repoUrl: string
  outputPath?: string
  clientSessionId: string
  limit?: number
}): Promise<void> {
  const repoName = extractRepoNameFromUrl(repoUrl)
  console.log(`Picking commits from repository: ${repoName}`)
  console.log(`Repository URL: ${repoUrl}`)
  console.log(`Commit limit: ${limit}`)

  // Setup the test repository
  console.log('Cloning repository...')
  const repoPath = await setupTestRepo(repoUrl, repoName)

  // Get commits
  console.log(`Fetching last ${limit} commits...`)
  const allCommits = getCommits(repoPath, limit)
  console.log(`Found ${allCommits.length} commits`)

  // Apply basic filtering
  console.log('Applying basic filters...')
  const filteredCommits = basicFilter(allCommits)
  console.log(
    `${filteredCommits.length} commits remaining after basic filtering`,
  )

  if (filteredCommits.length === 0) {
    console.log('No commits passed basic filtering. Exiting.')
    return
  }

  // Screen commits with GPT-5
  console.log('Screening commits with GPT-5...')
  const selectedCommits = await screenCommitsWithGpt5(
    filteredCommits,
    repoUrl,
    repoPath,
    clientSessionId,
  )
  console.log(`\nFinal selection: ${selectedCommits.length} commits`)

  // Create result object
  const result: CommitPickerResult = {
    repoUrl,
    repoName,
    generationDate: new Date().toISOString(),
    totalCommitsScanned: allCommits.length,
    commitsAfterBasicFilter: filteredCommits.length,
    selectedCommits,
  }

  // Write to file
  const generatedOutputPath =
    outputPath ||
    path.join(
      __dirname,
      `picked-commits-${repoName}-${new Date().toISOString().split('T')[0]}.json`,
    )

  fs.writeFileSync(generatedOutputPath, JSON.stringify(result, null, 2))
  console.log(`\nResults saved to: ${generatedOutputPath}`)

  // Print summary
  console.log('\n=== COMMIT PICKER SUMMARY ===')
  console.log(`Repository: ${repoUrl}`)
  console.log(`Total commits scanned: ${result.totalCommitsScanned}`)
  console.log(`After basic filtering: ${result.commitsAfterBasicFilter}`)
  console.log(`Final selection: ${result.selectedCommits.length}`)
  console.log('\nSelected commits:')
  selectedCommits.forEach((commit, index) => {
    console.log(
      `\n${index + 1}. ${commit.sha.substring(0, 8)}: ${commit.message}`,
    )
    console.log(`   URL: ${commit.githubUrl}`)
    console.log(`   Description: ${commit.shortDescription}`)
    console.log(`   Reason: ${commit.reason}`)
    console.log(
      `   Stats: ${commit.stats.filesChanged} files, +${commit.stats.insertions} -${commit.stats.deletions}`,
    )
  })
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log('Usage: bun run pick-commits <repo-url> [output-path] [limit]')
    console.log('')
    console.log('Examples:')
    console.log('  bun run pick-commits https://github.com/user/repo')
    console.log(
      '  bun run pick-commits https://github.com/user/repo ./commits.json 300',
    )
    process.exit(1)
  }

  const repoUrl = args[0]
  const outputPath = args[1]
  const limit = args[2] ? parseInt(args[2]) : 200

  if (!repoUrl) {
    console.error('Error: repo-url is required')
    process.exit(1)
  }

  // Generate random session ID for this run
  const sessionId = Math.random().toString(36).substring(2)

  pickCommits({
    repoUrl,
    outputPath,
    clientSessionId: sessionId,
    limit,
  })
    .then(() => {
      console.log('\nCommit picking completed successfully!')
      process.exit(0)
    })
    .catch((err) => {
      console.error('Error picking commits:', err)
      process.exit(1)
    })
}
