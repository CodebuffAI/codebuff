import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { promptAiSdkStructured } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { models } from '@codebuff/common/constants'
import { z } from 'zod/v4'

import { extractRepoNameFromUrl, setupTestRepo } from './setup-test-repo'

// Types for the evaluation data structure
export interface Diff {
  path: string
  preContent: string
  postContent: string
}

export interface EvalCommit {
  sha: string
  spec: string
  diffs: Diff[]
}

export interface EvalData {
  repoUrl: string
  generationDate: string
  evalCommits: EvalCommit[]
}

// Input structure for creating evaluations
export interface EvalInput {
  commitSha: string // Required - defines the codebase state to load for the task
  diffs?: Diff[] // Optional - if not provided, will compute diff from commit parent
}

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

Format your response as a clear, concise description of what needs to be implemented.`

const fingerprintId = 'evals-v2'
const userInputId = 'evals-v2'

async function generateDiffFromCommit(
  repoPath: string,
  commitSha: string,
): Promise<Diff[]> {
  // Get list of files changed in this commit
  const filesCommand = `git show --name-only --pretty=format:"" ${commitSha}`
  const changedFiles = execSync(filesCommand, { cwd: repoPath })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)

  // Get the content of each file before and after the commit
  const diffs: Diff[] = []
  for (const file of changedFiles) {
    try {
      // Get content from parent commit (commit^)
      const preCommand = `git show ${commitSha}^:${file}`
      const preContent = execSync(preCommand, { cwd: repoPath }).toString()

      // Get content after commit
      const postCommand = `git show ${commitSha}:${file}`
      const postContent = execSync(postCommand, { cwd: repoPath }).toString()

      diffs.push({
        path: file,
        preContent,
        postContent,
      })
    } catch (error) {
      // File might not exist in parent commit (new file) or might be deleted
      try {
        const postContent = execSync(`git show ${commitSha}:${file}`, {
          cwd: repoPath,
        }).toString()
        diffs.push({
          path: file,
          preContent: '[NEW FILE]',
          postContent,
        })
      } catch {
        try {
          const preContent = execSync(`git show ${commitSha}^:${file}`, {
            cwd: repoPath,
          }).toString()
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

async function generateSpecForDiffs(
  diffs: Diff[],
  clientSessionId: string,
): Promise<string> {
  // Build context from the diffs
  const diffContext = diffs
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

File Changes:\n${diffContext}`

  const { spec } = await promptAiSdkStructured({
    messages: [{ role: 'user', content: prompt }],
    schema: z.object({ spec: z.string() }),
    model: models.openrouter_claude_sonnet_4,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId: undefined,
  })

  return spec
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
  const clonedRepoName = await setupTestRepo(repoUrl, actualRepoName)
  const repoPath = path.join(__dirname, '../test-repos', clonedRepoName)

  console.log(`Processing ${evalInputs.length} evaluation inputs...`)

  // Process each eval input
  const evalCommits: EvalCommit[] = []

  for (const evalInput of evalInputs) {
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
    }

    // Get diffs - either provided or computed from commit
    const diffs =
      evalInput.diffs ??
      (await generateDiffFromCommit(repoPath, evalInput.commitSha))

    // Generate spec from diffs
    const spec = await generateSpecForDiffs(diffs, clientSessionId)

    evalCommits.push({
      sha: evalInput.commitSha,
      spec,
      diffs,
    })

    console.log(
      `Generated spec for ${evalInput.commitSha}: ${spec.substring(0, 100)}...`,
    )
  }

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
    diffs: [
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
