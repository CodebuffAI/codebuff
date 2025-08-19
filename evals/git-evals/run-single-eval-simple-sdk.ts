#!/usr/bin/env bun

import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'

import { generateCompactId } from '@codebuff/common/util/string'
import { CodebuffClient } from '../../sdk/src/client'
import { Command, Flags } from '@oclif/core'

import { extractRepoNameFromUrl, setupTestRepo } from './setup-test-repo'
import { resetRepoToCommit } from '../scaffolding'

import type { EvalCommit, EvalData, FileState } from './types'

class RunSingleEvalSimpleSDKCommand extends Command {
  static description = 'Run a single git evaluation task using the Codebuff SDK (simplified version)'

  static examples = [
    '$ bun run-single-eval-simple-sdk --eval-file eval-codebuff.json --commit-index 0',
    '$ bun run-single-eval-simple-sdk --eval-file eval-manifold.json --commit-sha abc123',
  ]

  static flags = {
    'eval-file': Flags.string({
      char: 'f',
      description: 'Path to the eval JSON file (e.g., eval-codebuff.json)',
      required: true,
    }),
    'commit-index': Flags.integer({
      char: 'i',
      description: 'Index of the commit to evaluate (0-based)',
    }),
    'commit-sha': Flags.string({
      char: 's',
      description: 'SHA of the specific commit to evaluate',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file path for results (optional)',
    }),
    help: Flags.help({ char: 'h' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(RunSingleEvalSimpleSDKCommand)

    // Validate that either commit-index or commit-sha is provided
    if (
      !flags['commit-index'] &&
      flags['commit-index'] !== 0 &&
      !flags['commit-sha']
    ) {
      this.error('Either --commit-index or --commit-sha must be provided')
    }

    if (flags['commit-index'] !== undefined && flags['commit-sha']) {
      this.error('Cannot specify both --commit-index and --commit-sha')
    }

    await runSingleEvalTaskSimpleSDK(flags)
  }
}

async function runSingleEvalTaskSimpleSDK(options: {
  'eval-file': string
  'commit-index'?: number
  'commit-sha'?: string
  output?: string
}): Promise<void> {
  const {
    'eval-file': evalFile,
    'commit-index': commitIndex,
    'commit-sha': commitSha,
    output: outputFile,
  } = options

  console.log('🚀 Starting single git eval (Simple SDK mode)...')
  console.log(`Eval file: ${evalFile}`)

  // Load eval data
  if (!fs.existsSync(evalFile)) {
    throw new Error(`Eval file not found: ${evalFile}`)
  }

  const evalData = JSON.parse(fs.readFileSync(evalFile, 'utf-8')) as EvalData
  console.log(`Repository: ${evalData.repoUrl}`)
  console.log(`Total commits available: ${evalData.evalCommits.length}`)

  // Find the specific commit to evaluate
  let evalCommit: EvalCommit
  if (commitSha) {
    const found = evalData.evalCommits.find((commit) =>
      commit.sha.startsWith(commitSha),
    )
    if (!found) {
      throw new Error(`Commit with SHA ${commitSha} not found in eval data`)
    }
    evalCommit = found
    console.log(`Selected commit by SHA: ${commitSha}`)
  } else if (commitIndex !== undefined) {
    if (commitIndex < 0 || commitIndex >= evalData.evalCommits.length) {
      throw new Error(
        `Commit index ${commitIndex} is out of range (0-${evalData.evalCommits.length - 1})`,
      )
    }
    evalCommit = evalData.evalCommits[commitIndex]
    console.log(`Selected commit by index: ${commitIndex}`)
  } else {
    throw new Error('No commit specified')
  }

  console.log(
    `Commit: ${evalCommit.sha.slice(0, 8)} - ${evalCommit.spec.split('\n')[0]}`,
  )

  // Setup test repository
  const testRepoName =
    evalData.testRepoName || extractRepoNameFromUrl(evalData.repoUrl)
  console.log(`📁 Setting up test repository: ${testRepoName}`)

  const projectPath = await setupTestRepo(
    evalData.repoUrl,
    testRepoName,
    evalCommit.sha,
  )
  console.log(`Repository cloned to: ${projectPath}`)

  console.log('🤖 Running evaluation with SDK...')
  console.log(
    `Spec: ${evalCommit.spec.slice(0, 100)}${evalCommit.spec.length > 100 ? '...' : ''}`,
  )

  const startTime = Date.now()
  let error: string | undefined
  let fileStates: FileState[] = []

  try {
    // Reset to the commit before the target commit
    resetRepoToCommit(projectPath, `${evalCommit.sha}^`)

    // Initialize SDK client
    const client = new CodebuffClient({
      cwd: projectPath,
      onError: (error) => {
        console.error('SDK error:', error.message)
      },
    })

    console.log('Running Codebuff with the specification...')
    
    // Run CodeBuff directly with the specification
    const result = await client.run({
      agent: 'base',
      prompt: evalCommit.spec,
    })

    console.log('SDK run completed successfully')
    console.log(`Tool results: ${result.toolResults?.length || 0}`)

    // Extract file changes from tool results
    const changedFiles = new Set<string>()
    if (result.toolResults) {
      for (const toolResult of result.toolResults) {
        if (toolResult.toolCall && 
            (toolResult.toolCall.toolName === 'write_file' || toolResult.toolCall.toolName === 'str_replace') &&
            'path' in toolResult.toolCall.input) {
          changedFiles.add(toolResult.toolCall.input.path as string)
        }
      }
    }

    // Capture file states
    fileStates = Array.from(changedFiles).map(filePath => {
      // Capture "after" state
      const fullPath = path.join(projectPath, filePath)
      let postContent: string
      try {
        postContent = fs.existsSync(fullPath)
          ? fs.readFileSync(fullPath, 'utf-8')
          : '[FILE_NOT_FOUND_POST_RUN]'
      } catch (e) {
        console.error(`Error reading file ${fullPath} for after state:`, e)
        postContent = '[ERROR_READING_AFTER_STATE]'
      }

      // Capture "before" state
      let preContent: string
      try {
        preContent = execSync(`git show ${evalCommit.sha}^:"${filePath}"`, {
          cwd: projectPath,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).toString()
      } catch (e) {
        preContent = '[FILE_DID_NOT_EXIST_PRIOR_TO_CODEBUFF_CHANGES]'
      }

      return { path: filePath, preContent, postContent }
    })

    // Close connection safely
    try {
      client.closeConnection()
    } catch (closeError) {
      console.debug('Note: SDK client close error (likely not connected):', closeError)
    }

  } catch (e) {
    console.error('Error in evaluation:', e)
    error = e instanceof Error ? `${e.message}\n${e.stack}` : `Unknown error: ${String(e)}`
  }

  const duration = Date.now() - startTime
  console.log(`✅ Evaluation completed in ${(duration / 1000).toFixed(1)}s`)

  // Create simple result structure (without judging for now)
  const result = {
    eval_commit: evalCommit,
    error,
    fileStates,
    durationMs: duration,
    simplified: true, // Flag to indicate this is the simplified SDK version
  }

  // Display results
  if (error) {
    console.log(`❌ Error occurred: ${error}`)
  } else {
    console.log('📊 Results:')
    console.log(`  Files modified: ${fileStates.length}`)
    if (fileStates.length > 0) {
      console.log('  Modified files:')
      fileStates.forEach(file => {
        console.log(`    • ${file.path}`)
      })
    }
  }

  // Save results if output file specified
  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2))
    console.log(`💾 Results saved to: ${outputFile}`)
  }

  process.exit(error ? 1 : 0)
}

// CLI handling
if (require.main === module) {
  RunSingleEvalSimpleSDKCommand.run().catch((err) => {
    console.error('Error running simple SDK eval:', err)
    process.exit(1)
  })
}

export { RunSingleEvalSimpleSDKCommand, runSingleEvalTaskSimpleSDK }