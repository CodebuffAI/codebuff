#!/usr/bin/env bun

import fs from 'fs'

import { generateCompactId } from '@codebuff/common/util/string'
import {
  setProjectRoot,
  setWorkingDirectory,
} from '@codebuff/npm-app/project-files'
import { recreateShell } from '@codebuff/npm-app/terminal/run-command'
import { Command, Flags } from '@oclif/core'

import { createFileReadingMock } from '../scaffolding'
import { setupTestEnvironmentVariables } from '../test-setup'
import { runSingleEval } from './run-git-evals'
import { extractRepoNameFromUrl, setupTestRepo } from './setup-test-repo'

import type { EvalCommit, EvalData, ModelConfig } from './types'

class RunSingleEvalCommand extends Command {
  static description = 'Run a single git evaluation task'

  static examples = [
    '$ bun run-single-eval --eval-file eval-codebuff.json --commit-index 0',
    '$ bun run-single-eval --eval-file eval-manifold.json --commit-sha abc123',
    '$ bun run-single-eval --eval-file eval-codebuff.json --commit-index 5 --output results.json',
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
    'model-config': Flags.string({
      char: 'm',
      description: 'JSON string with model configuration (optional)',
      default: '{}',
    }),
    help: Flags.help({ char: 'h' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(RunSingleEvalCommand)

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

    await runSingleEvalTask(flags)
  }
}

async function runSingleEvalTask(options: {
  'eval-file': string
  'commit-index'?: number
  'commit-sha'?: string
  output?: string
  'model-config': string
}): Promise<void> {
  const {
    'eval-file': evalFile,
    'commit-index': commitIndex,
    'commit-sha': commitSha,
    output: outputFile,
    'model-config': modelConfigStr,
  } = options

  console.log('🚀 Starting single git eval...')
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

  // Parse model config
  let modelConfig: ModelConfig
  try {
    modelConfig = JSON.parse(modelConfigStr)
  } catch (error) {
    throw new Error(`Invalid model config JSON: ${error}`)
  }

  // Setup test environment
  console.log('🔧 Setting up test environment...')
  setupTestEnvironmentVariables()

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

  // Setup project context
  setProjectRoot(projectPath)
  createFileReadingMock(projectPath)
  recreateShell(projectPath)
  setWorkingDirectory(projectPath)

  // Generate session identifiers
  const clientSessionId = generateCompactId()
  const fingerprintId = generateCompactId()

  console.log('🤖 Running evaluation...')
  console.log(
    `Spec: ${evalCommit.spec.slice(0, 100)}${evalCommit.spec.length > 100 ? '...' : ''}`,
  )

  const startTime = Date.now()

  try {
    // Run the evaluation
    const result = await runSingleEval(
      evalCommit,
      projectPath,
      clientSessionId,
      fingerprintId,
    )

    const duration = Date.now() - startTime
    console.log(`✅ Evaluation completed in ${(duration / 1000).toFixed(1)}s`)

    // Display results
    if (result.error) {
      console.log(`❌ Error occurred: ${result.error}`)
    } else {
      console.log('📊 Results:')
      if (result.judging_results) {
        const metrics = result.judging_results.metrics
        console.log(`  Overall Score: ${metrics.overallScore.toFixed(2)}/10`)
        console.log(`  Completion: ${metrics.completionScore.toFixed(2)}/10`)
        console.log(`  Efficiency: ${metrics.efficiencyScore.toFixed(2)}/10`)
        console.log(`  Code Quality: ${metrics.codeQualityScore.toFixed(2)}/10`)

        if (result.judging_results.strengths.length > 0) {
          console.log('  Strengths:')
          result.judging_results.strengths.forEach((strength) => {
            console.log(`    • ${strength}`)
          })
        }

        if (result.judging_results.weaknesses.length > 0) {
          console.log('  Weaknesses:')
          result.judging_results.weaknesses.forEach((weakness) => {
            console.log(`    • ${weakness}`)
          })
        }
      }

      console.log(`  Files modified: ${result.fileStates.length}`)
      console.log(`  Conversation turns: ${result.trace.length}`)
    }

    // Save results if output file specified
    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2))
      console.log(`💾 Results saved to: ${outputFile}`)
    }

    process.exit(0)
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(
      `❌ Evaluation failed after ${(duration / 1000).toFixed(1)}s:`,
      error,
    )
    process.exit(1)
  }
}

// CLI handling
if (require.main === module) {
  RunSingleEvalCommand.run().catch((err) => {
    console.error('Error running single eval:', err)
    process.exit(1)
  })
}

export { RunSingleEvalCommand, runSingleEvalTask }
