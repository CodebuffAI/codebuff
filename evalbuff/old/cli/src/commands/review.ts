import fs from 'fs'
import path from 'path'

import { CodebuffClient } from '@codebuff/sdk'

import { reviewAgent } from '../../../agents/review-agent'
import { ensureAuth } from '../utils/auth'
import { readConfig } from '../utils/config'
import {
  getDiff,
  getChangedFiles,
  isGitRepo,
} from '../utils/git'
import { readKnowledgeFiles } from '../utils/knowledge'
import { printError, printWarning, Spinner } from '../utils/output'
import { findProjectRoot } from '../utils/project'

interface ReviewOptions {
  cwd?: string
  files?: string[]
  branch?: string | true
  staged?: boolean
  commit?: string
}

export async function reviewCommand(
  prompt: string | undefined,
  options: ReviewOptions,
): Promise<void> {
  try {
    const apiKey = await ensureAuth()
    const projectRoot = findProjectRoot(options.cwd)

    if (!isGitRepo(projectRoot)) {
      printError('Not a git repository. Run from within a git repo.')
      process.exit(2)
    }

    const config = readConfig(projectRoot)
    if (!config) {
      printWarning(
        'evalbuff not initialized. Run "evalbuff init" for better results.',
      )
    }

    const defaultBranch = config?.review?.defaultBranch ?? 'main'

    const diffOptions = {
      cwd: projectRoot,
      files: options.files,
      branch: options.branch,
      staged: options.staged,
      commit: options.commit,
      defaultBranch,
    }

    const diff = getDiff(diffOptions)

    if (!diff.trim()) {
      process.stderr.write('No changes to review.\n')
      process.exit(0)
    }

    const changedFiles = options.files ?? getChangedFiles(diffOptions)

    const spinner = new Spinner()
    spinner.start('Collecting diff...')

    const fileContents: Record<string, string> = {}
    for (const filePath of changedFiles) {
      const absPath = path.join(projectRoot, filePath)
      if (fs.existsSync(absPath)) {
        try {
          fileContents[filePath] = fs.readFileSync(absPath, 'utf8')
        } catch {
          // skip unreadable files
        }
      }
    }

    const knowledgeFiles = readKnowledgeFiles(projectRoot)

    spinner.update(`Analyzing ${changedFiles.length} changed files...`)

    let agentPrompt = `## Git Diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n\n`
    agentPrompt += `## Changed Files (full contents)\n\n`
    for (const [filePath, content] of Object.entries(fileContents)) {
      agentPrompt += `### ${filePath}\n\n\`\`\`\n${content}\n\`\`\`\n\n`
    }

    if (prompt) {
      agentPrompt += `## Original Request\n\nThe user's original request was: "${prompt}"\n\nInclude a Goal Assessment in your review that evaluates whether the changes fulfill this intent.\n`
    }

    const client = new CodebuffClient({ apiKey })

    let output = ''

    spinner.update('Generating review...')

    const result = await client.run({
      agent: reviewAgent,
      prompt: agentPrompt,
      cwd: projectRoot,
      knowledgeFiles,
      maxAgentSteps: 10,
      handleStreamChunk: (chunk) => {
        if (typeof chunk === 'string') {
          output += chunk
        }
      },
    })

    spinner.stop()

    if (result.output.type === 'error') {
      printError(result.output.message)
      process.exit(2)
    }

    process.stdout.write(output)
    if (output.length > 0 && !output.endsWith('\n')) {
      process.stdout.write('\n')
    }

    process.stderr.write('✓ Done\n')

    if (output.includes('🔴')) {
      process.exit(1)
    }
  } catch (error) {
    printError(
      error instanceof Error
        ? error.message
        : 'Review failed.',
    )
    process.exit(2)
  }
}
