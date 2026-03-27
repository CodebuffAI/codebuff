import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export interface CommitTask {
  sha: string
  parentSha: string
  message: string
  prompt: string
  diff: string
  filesChanged: string[]
}

/**
 * Get a list of commits from the repo, oldest first.
 * Starts from `startAfterSha` (exclusive) or HEAD~commitCount if no state.
 */
export function getCommitList(
  repoPath: string,
  commitCount: number,
  startAfterSha?: string,
): string[] {
  if (startAfterSha) {
    // Get all commits from startAfterSha (exclusive) to HEAD
    const output = execSync(
      `git log --format=%H --reverse ${startAfterSha}..HEAD`,
      { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    ).trim()
    return output ? output.split('\n') : []
  }

  // Get last N commits, oldest first
  const output = execSync(
    `git log --format=%H -n ${commitCount} --reverse`,
    { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
  ).trim()
  return output ? output.split('\n') : []
}

/**
 * Extract commit info needed to build a task.
 * Returns null for merge commits or commits with no parent.
 */
export function getCommitInfo(
  repoPath: string,
  sha: string,
): { parentSha: string; message: string; diff: string; filesChanged: string[] } | null {
  try {
    // Get parent SHA
    const parents = execSync(`git log --pretty=%P -n 1 ${sha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim()

    if (!parents) return null // initial commit

    const parentList = parents.split(' ')
    if (parentList.length > 1) return null // merge commit

    const parentSha = parentList[0]

    // Get commit message
    const message = execSync(`git log --format=%B -n 1 ${sha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim()

    // Get diff
    const diff = execSync(`git diff ${parentSha} ${sha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })

    // Get files changed
    const filesOutput = execSync(`git diff --name-only ${parentSha} ${sha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim()
    const filesChanged = filesOutput ? filesOutput.split('\n') : []

    return { parentSha, message, diff, filesChanged }
  } catch {
    return null
  }
}

/**
 * Generate a human-like task prompt from a commit's message and diff.
 * Uses Claude CLI to rephrase the commit into a natural coding task.
 */
export async function generatePromptFromCommit(
  message: string,
  diff: string,
  filesChanged: string[],
): Promise<string> {
  const systemPrompt = `You are generating a task prompt that a developer might write to ask a coding agent to make changes to a codebase. You'll be given a git commit message and diff. Your job is to write a natural, human-sounding prompt that would lead an agent to make similar changes.

## Rules

1. Write as if you're a developer describing what you want done — NOT as if you've seen the solution
2. Be vague enough that the agent has to figure out the implementation details, but specific enough about the desired outcome
3. Do NOT mention specific line numbers, exact variable names from the diff, or implementation details
4. DO mention the general area of the codebase, the feature/bug, and the desired behavior
5. Keep it to 1-4 sentences
6. Sound natural — like a Slack message or a ticket description, not a formal spec

## Output

Respond with ONLY the prompt text, nothing else.`

  const userPrompt = `Commit message: ${message}

Files changed: ${filesChanged.join(', ')}

Diff (first 3000 chars):
${diff.slice(0, 3000)}`

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-promptgen-'))
  const promptFile = path.join(tmpDir, 'PROMPT_GEN.md')

  try {
    fs.writeFileSync(promptFile, `${systemPrompt}\n\n---\n\n${userPrompt}`)

    const output = execSync(
      `claude --dangerously-skip-permissions -p "Read ${promptFile} and follow all instructions. Respond with ONLY the task prompt text."`,
      {
        encoding: 'utf-8',
        timeout: 2 * 60 * 1000,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      },
    ).trim()

    return output || `${message}`
  } catch {
    // Fallback to the commit message itself
    return message
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Build a full CommitTask from a SHA.
 * Returns null if the commit can't be used (merge, initial, etc).
 */
export async function buildCommitTask(
  repoPath: string,
  sha: string,
): Promise<CommitTask | null> {
  const info = getCommitInfo(repoPath, sha)
  if (!info) return null

  // Skip commits with very large diffs (likely auto-generated)
  if (info.diff.length > 50_000) {
    console.log(`Skipping ${sha.slice(0, 8)}: diff too large (${info.diff.length} chars)`)
    return null
  }

  // Skip commits with no meaningful code changes
  if (info.filesChanged.length === 0) {
    return null
  }

  const prompt = await generatePromptFromCommit(
    info.message,
    info.diff,
    info.filesChanged,
  )

  return {
    sha,
    parentSha: info.parentSha,
    message: info.message,
    prompt,
    diff: info.diff,
    filesChanged: info.filesChanged,
  }
}
