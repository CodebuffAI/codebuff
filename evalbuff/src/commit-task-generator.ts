import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { generatePrompt } from './llm'

export interface CommitTask {
  sha: string
  parentSha: string
  message: string
  prompt: string
  diff: string
  filesChanged: string[]
}

const MAX_DIFF_CHARS = 200_000

/**
 * Commit message patterns that indicate trivial/automated commits not worth
 * running agents on. Saves ~10 agent+judge invocations per skipped commit.
 */
const TRIVIAL_COMMIT_PATTERNS = [
  /^bump\b.*\bversion\b/i,
  /^v?\d+\.\d+\.\d+$/,           // version-only messages like "1.0.635"
  /^release\s+v?\d+/i,
  /^chore\(release\)/i,
  /^update\s+(change|changelog)/i,
  /^merge\s+(branch|pull request)/i,
]

/**
 * Returns true if a commit is trivial and should be skipped.
 * Checks commit message patterns and whether only package.json version fields changed.
 */
function isTrivialCommit(
  message: string,
  filesChanged: string[],
  diff: string,
): boolean {
  const firstLine = message.split('\n')[0].trim()

  // Check message patterns
  if (TRIVIAL_COMMIT_PATTERNS.some((p) => p.test(firstLine))) return true

  // Single package.json change that only touches "version" field
  if (
    filesChanged.length === 1 &&
    filesChanged[0].endsWith('package.json') &&
    diff.length < 1000
  ) {
    const addedLines = diff
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    const removedLines = diff
      .split('\n')
      .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    const allVersionChanges =
      [...addedLines, ...removedLines].every((l) =>
        /^\s*[+-]\s*"version"/.test(l),
      )
    if (allVersionChanges) return true
  }

  return false
}

/**
 * Files that add noise to diffs without useful signal.
 * Lockfiles are huge and auto-generated — agents shouldn't replicate them.
 */
const NOISE_FILE_PATTERNS = [
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  'go.sum',
]

function isNoiseFile(filePath: string): boolean {
  const basename = filePath.split('/').pop() || ''
  return NOISE_FILE_PATTERNS.includes(basename)
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

    // Get files changed (filter out noise files like lockfiles)
    const filesOutput = execSync(`git diff --name-only ${parentSha} ${sha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim()
    const allFiles = filesOutput ? filesOutput.split('\n') : []
    const filesChanged = allFiles.filter((f) => !isNoiseFile(f))

    // Get diff, excluding noise files (lockfiles etc.)
    const excludeArgs = NOISE_FILE_PATTERNS.map((p) => `':!${p}'`).join(' ')
    const diff = execSync(
      `git diff ${parentSha} ${sha} -- . ${excludeArgs}`,
      {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      },
    )

    return { parentSha, message, diff, filesChanged }
  } catch {
    return null
  }
}

/**
 * Read a file's content at a specific commit SHA.
 * Returns null if the file doesn't exist at that commit.
 */
function readFileAtCommit(
  repoPath: string,
  sha: string,
  filePath: string,
): string | null {
  try {
    return execSync(`git show ${sha}:${JSON.stringify(filePath)}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/**
 * Read the full contents of all files being modified at the parent commit.
 * This gives the prompt generator context about what the code looks like
 * before the change, so it can write a realistic human prompt.
 */
function readFilesAtParent(
  repoPath: string,
  parentSha: string,
  filesChanged: string[],
): Record<string, string> {
  const files: Record<string, string> = {}
  let totalSize = 0
  const maxTotalSize = 500_000 // 500K total for all files

  for (const filePath of filesChanged) {
    if (totalSize >= maxTotalSize) break
    if (isNoiseFile(filePath)) continue

    const content = readFileAtCommit(repoPath, parentSha, filePath)
    if (content != null && content.length > 0) {
      files[filePath] = content
      totalSize += content.length
    }
  }

  return files
}

const PROMPT_GEN_SYSTEM = `You are generating a task prompt that a human developer would realistically write to ask an AI coding agent to make changes to their codebase.

You will receive:
- A git diff showing exactly what was changed
- The full contents of all files being modified (as they looked BEFORE the change)
- The commit message (as a hint, but don't just copy it)

Your job is to write a natural, human-sounding prompt — the kind of thing a developer would type into a chat with an AI assistant.

## Key Principles

1. Focus on high-level functional requirements, not implementation details
   - GOOD: "add user authentication to the API"
   - BAD: "implement an authenticateUser function in src/auth/middleware.ts"

2. Use natural language — like a Slack message or ticket description
   - GOOD: "the nightly CI is pointing at the wrong directory, it should be agents not .agents"
   - BAD: "Update the directory reference in .github/workflows/nightly-e2e.yml from .agents to agents"

3. Describe what you WANT or what's WRONG, not how to fix it
   - GOOD: "the hover state on buttons looks broken"
   - BAD: "change the CSS hover opacity from 0.5 to 0.8 in Button.tsx"

4. Don't reference specific file paths unless a human naturally would. Humans describe the feature area, not the file tree.
   - GOOD: "our login page needs to redirect to freebuff.com instead of codebuff.com"
   - BAD: "update src/auth/login.ts, src/config/urls.ts, and tests/auth.test.ts to change codebuff.com to freebuff.com"

5. Don't over-specify. Leave room for the agent to figure out the implementation.

6. Keep it to 1-4 sentences.

7. Read the FULL file contents to understand context. The diff alone can be misleading — understanding the surrounding code helps you write a prompt that makes sense for this codebase.

## Output

Respond with ONLY the prompt text. No quotes, no preamble, no explanation.`

/**
 * Generate a human-like task prompt from a commit.
 * Reads the full files at the parent commit for context, similar to how
 * buffbench uses file-explorer agents to understand the codebase.
 */
export async function generatePromptFromCommit(
  repoPath: string,
  parentSha: string,
  message: string,
  diff: string,
  filesChanged: string[],
): Promise<string> {
  // Read full file contents at the parent commit for context
  const fileContents = readFilesAtParent(repoPath, parentSha, filesChanged)

  let filesSection = ''
  if (Object.keys(fileContents).length > 0) {
    filesSection = `## File Contents (before the change)\n\n`
    for (const [filePath, content] of Object.entries(fileContents)) {
      filesSection += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`
    }
  }

  const userPrompt = `## Commit Message
${message}

${filesSection}## Diff
\`\`\`diff
${diff}
\`\`\``

  try {
    // Use API directly — faster than spawning Claude CLI (~3s vs ~15s)
    // and avoids CLAUDE.md/AGENTS.md context pollution
    const output = await generatePrompt(PROMPT_GEN_SYSTEM, userPrompt)
    return output || message
  } catch {
    // Fallback to the commit message itself
    return message
  }
}

/**
 * Build a full CommitTask from a SHA.
 * Returns null if the commit can't be used (merge, initial, too large diff, etc).
 */
export async function buildCommitTask(
  repoPath: string,
  sha: string,
): Promise<CommitTask | null> {
  const info = getCommitInfo(repoPath, sha)
  if (!info) return null

  // Skip trivial/automated commits (version bumps, releases, etc.)
  if (isTrivialCommit(info.message, info.filesChanged, info.diff)) {
    console.log(`Skipping ${sha.slice(0, 8)}: trivial commit (${info.message.split('\n')[0].slice(0, 50)})`)
    return null
  }

  // Skip commits with diffs that exceed our limit
  if (info.diff.length > MAX_DIFF_CHARS) {
    console.log(`Skipping ${sha.slice(0, 8)}: diff too large (${info.diff.length} chars)`)
    return null
  }

  // Skip commits with no meaningful code changes (after filtering noise files)
  if (info.filesChanged.length === 0) {
    return null
  }

  // Skip commits where the diff is empty after filtering noise files
  if (info.diff.trim().length === 0) {
    console.log(`Skipping ${sha.slice(0, 8)}: only noise files changed (lockfiles, etc.)`)
    return null
  }

  const prompt = await generatePromptFromCommit(
    repoPath,
    info.parentSha,
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
