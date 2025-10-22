import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { disableLiveUserInputCheck } from '@codebuff/agent-runtime/live-user-inputs'
import { promptAiSdk } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { models } from '@codebuff/common/old-constants'
import { mapLimit } from 'async'

import { extractRepoNameFromUrl, setupTestRepo } from './setup-test-repo'

import type { EvalData, EvalInput, FileState, EvalCommit } from './types'
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

async function getParentSha(
  repoPath: string,
  commitSha: string,
): Promise<string | null> {
  try {
    const parentSha = execSync(`git rev-parse ${commitSha}^`, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return parentSha
  } catch (error) {
    try {
      const parents = execSync(`git log --pretty=%P -n 1 ${commitSha}`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      const parentCount = parents.split(' ').filter(Boolean).length
      if (parentCount === 0) {
        console.warn(
          `Skipping ${commitSha.slice(0, 8)} - initial commit (no parent)`,
        )
        return null
      } else if (parentCount > 1) {
        console.warn(
          `Skipping ${commitSha.slice(0, 8)} - merge commit (${parentCount} parents)`,
        )
        return null
      }
    } catch (e) {
      console.error(`Error checking parents for ${commitSha.slice(0, 8)}:`, e)
    }
    return null
  }
}

async function generateFileStateFromCommit(
  repoPath: string,
  commitSha: string,
): Promise<FileState[]> {
  // Get list of files changed in this commit
  const filesCommand = `git show --name-only --pretty=format:"" ${commitSha}`
  const changedFiles = execSync(filesCommand, { cwd: repoPath })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)

  // Get the content of each file before and after the commit
  const fileStates: FileState[] = []
  for (const file of changedFiles) {
    try {
      // Get content after commit first
      const postCommand = `git show ${commitSha}:${JSON.stringify(file)}`
      const postContent = execSync(postCommand, {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString()

      try {
        // Try to get content from parent commit (commit^)
        const preCommand = `git show ${commitSha}^:${JSON.stringify(file)}`
        const preContent = execSync(preCommand, {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).toString()

        fileStates.push({
          path: file,
          preContent,
          postContent,
        })
      } catch {
        // File doesn't exist in parent commit (new file)
        fileStates.push({
          path: file,
          preContent: '[NEW FILE]',
          postContent,
        })
      }
    } catch {
      // File doesn't exist in this commit (deleted file)
      try {
        const preContent = execSync(
          `git show ${commitSha}^:${JSON.stringify(file)}`,
          {
            cwd: repoPath,
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        ).toString()
        fileStates.push({
          path: file,
          preContent,
          postContent: '[DELETED]',
        })
      } catch {
        console.warn(`Could not process file ${file} for commit ${commitSha}`)
      }
    }
  }

  return fileStates
}

async function generateSpecForFileStates(
  fileStates: FileState[],
  clientSessionId: string,
): Promise<string> {
  // Build context from the file states
  const fileContext = fileStates
    .map(({ path, preContent, postContent }) => {
      let diffDescription = `File: ${path}\n`

      if (preContent === '[NEW FILE]') {
        diffDescription += `New file created with content:\n${postContent}\n`
      } else if (postContent === '[DELETED]') {
        diffDescription += `File deleted (previous content):\n${preContent}\n`
      } else {
        diffDescription += `Before:\n${preContent}\n\nAfter:\n${postContent}\n`
      }

      return diffDescription
    })
    .join('\n---\n')

  const prompt = `${SPEC_GENERATION_PROMPT}

File Changes:\n${fileContext}`

  try {
    disableLiveUserInputCheck()
    const response = await promptAiSdk({
      messages: [{ role: 'user', content: prompt }],
      model: models.openrouter_claude_sonnet_4,
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

    // Extract spec from <spec></spec> tags
    const specMatch = response.match(/<spec>(.*?)<\/spec>/s)
    const spec = specMatch ? specMatch[1].trim() : response.trim()

    return spec || 'Failed to generate specification'
  } catch (error) {
    console.error('Error generating spec:', error)
    return 'Failed to generate specification due to error'
  }
}

export async function generateEvalFile({
  repoUrl,
  evalInputs,
  outputPath,
  clientSessionId,
}: {
  repoUrl: string
  evalInputs: EvalInput[]
  outputPath?: string
  clientSessionId: string
}): Promise<void> {
  // Extract repo name from URL
  const actualRepoName = extractRepoNameFromUrl(repoUrl)

  // Setup the test repository (needed for the commitSha reference)
  console.log(`Setting up test repository from: ${repoUrl}`)
  const repoPath = await setupTestRepo(repoUrl, actualRepoName, 'HEAD')

  console.log(
    `Processing ${evalInputs.length} evaluation inputs in parallel...`,
  )

  // Process commits in parallel with controlled concurrency
  const BATCH_SIZE = 5 // Process 5 commits at a time to avoid overwhelming the LLM API
  const evalCommits: EvalCommit[] = []

  // Helper function to process a single commit
  const processCommit = async (
    evalInput: EvalInput,
  ): Promise<EvalCommit | null> => {
    console.log(`Processing eval input ${evalInput.commitSha}...`)

    // Verify the commit exists in the repository (validates the codebase state reference)
    try {
      execSync(`git cat-file -e ${evalInput.commitSha}`, {
        cwd: repoPath,
        stdio: 'ignore',
      })
    } catch (error) {
      console.warn(
        `Warning: Commit ${evalInput.commitSha} not found in repository. Proceeding anyway.`,
      )
      return null
    }

    // Get parent SHA - either provided or computed from commit
    const parentSha =
      evalInput.parentSha ?? (await getParentSha(repoPath, evalInput.commitSha))

    if (!parentSha) {
      return null
    }

    // Get file states - either provided or computed from commit
    const fileStates =
      evalInput.fileStates ??
      (await generateFileStateFromCommit(repoPath, evalInput.commitSha))

    // Generate spec from file states
    const spec = await generateSpecForFileStates(fileStates, clientSessionId)

    console.log(
      `Generated spec for ${evalInput.commitSha}: ${spec.substring(0, 100)}...`,
    )

    return {
      sha: evalInput.commitSha,
      parentSha,
      spec,
      fileStates,
    }
  }

  // Process commits in parallel
  const batchResults = await mapLimit(evalInputs, BATCH_SIZE, processCommit)
  evalCommits.push(...(batchResults.filter(Boolean) as EvalCommit[]))

  // Create output data
  const evalData: EvalData = {
    repoUrl,
    generationDate: new Date().toISOString(),
    evalCommits,
  }

  const generatedOutputPath =
    outputPath ||
    path.join(__dirname, `../git-evals/eval-${actualRepoName}-v2.json`)

  // Write to file
  fs.writeFileSync(generatedOutputPath, JSON.stringify(evalData, null, 2))
  console.log(`Eval data written to ${generatedOutputPath}`)
}

// Example usage function
export function createExampleEvalInput(): EvalInput {
  return {
    commitSha: 'abc123def456', // Reference commit that defines the codebase state
    fileStates: [
      {
        path: 'src/auth.ts',
        preContent: '[NEW FILE]',
        postContent: `export interface User {
  id: string
  email: string
}

export function authenticateUser(token: string): User | null {
  // Implementation here
  return null
}`,
      },
      {
        path: 'src/middleware.ts',
        preContent: `export function middleware() {
  // Basic middleware
}`,
        postContent: `import { authenticateUser } from './auth'

export function middleware() {
  // Basic middleware
}

export function authMiddleware(req: Request) {
  const token = req.headers.authorization
  if (!token) {
    throw new Error('No token provided')
  }
  
  const user = authenticateUser(token)
  if (!user) {
    throw new Error('Invalid token')
  }
  
  return user
}`,
      },
    ],
  }
}

// CLI handling for backwards compatibility and testing
if (require.main === module) {
  const args = process.argv.slice(2)

  if (args[0] === '--example') {
    // Generate an example eval file for testing
    const sessionId = Math.random().toString(36).substring(2)
    const exampleInput = createExampleEvalInput()

    generateEvalFile({
      repoUrl: 'https://github.com/example/test-repo',
      evalInputs: [exampleInput],
      outputPath: 'eval-example-v2.json',
      clientSessionId: sessionId,
    })
      .then(() => console.log('Example eval file generated'))
      .catch(console.error)
  } else {
    console.log('Usage:')
    console.log('  --example  Generate an example evaluation file')
    console.log('')
    console.log(
      'For programmatic usage, import and use generateEvalFile() function',
    )
  }
}
