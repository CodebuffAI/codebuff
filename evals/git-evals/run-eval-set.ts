#!/usr/bin/env bun

import { sendEvalResultsEmail } from './email-eval-results'
import {
  analyzeEvalResults,
  PostEvalAnalysis,
} from './post-eval-analysis'
import { runGitEvals } from './run-git-evals'
import { FullEvalLog } from './types'

const DEFAULT_OUTPUT_DIR = 'git-evals'

interface EvalConfig {
  name: string
  evalDataPath: string
  outputDir: string
}

interface EvalResult {
  name: string
  status: 'success' | 'error'
  result?: FullEvalLog
  analysis?: PostEvalAnalysis
  error?: string
  duration: number
}

async function runEvalSet(
  outputDir: string = DEFAULT_OUTPUT_DIR
): Promise<void> {
  console.log('Starting eval set run...')
  console.log(`Output directory: ${outputDir}`)

  // Define the eval configurations
  const evalConfigs: EvalConfig[] = [
    {
      name: 'codebuff',
      evalDataPath: 'git-evals/eval-codebuff.json',
      outputDir,
    },
    {
      name: 'manifold',
      evalDataPath: 'git-evals/eval-manifold.json',
      outputDir,
    },
  ]

  console.log(`Running ${evalConfigs.length} evaluations sequentially:`)
  evalConfigs.forEach((config) => {
    console.log(
      `  - ${config.name}: ${config.evalDataPath} -> ${config.outputDir}`
    )
  })

  const startTime = Date.now()
  const results: EvalResult[] = []

  // Run all evaluations sequentially
  for (const config of evalConfigs) {
    console.log(`Starting ${config.name} evaluation...`)
    const evalStartTime = Date.now()

    try {
      const result = await runGitEvals(config.evalDataPath, config.outputDir)
      const evalDuration = Date.now() - evalStartTime
      console.log(
        `✅ ${config.name} evaluation completed in ${(evalDuration / 1000).toFixed(1)}s`
      )

      // Run post-eval analysis
      console.log(`Running post-eval analysis for ${config.name}...`)
      try {
        const analysis = await analyzeEvalResults(result)
        console.log(`📊 Post-eval analysis completed for ${config.name}`)
        console.log(`\n=== ${config.name.toUpperCase()} ANALYSIS ===`)
        console.log(`Summary: ${analysis.summary}`)
        console.log(`\nTop Problems:`)
        analysis.problems.forEach((problem, i) => {
          console.log(
            `${i + 1}. [${problem.severity.toUpperCase()}] ${problem.title}`
          )
          console.log(`   Frequency: ${(problem.frequency * 100).toFixed(1)}%`)
          console.log(`   ${problem.description}`)
        })

        results.push({
          name: config.name,
          status: 'success',
          result,
          analysis,
          duration: evalDuration,
        })
      } catch (analysisError) {
        console.warn(
          `⚠️ Post-eval analysis failed for ${config.name}:`,
          analysisError
        )
        results.push({
          name: config.name,
          status: 'success',
          result,
          duration: evalDuration,
        })
      }
    } catch (error) {
      const evalDuration = Date.now() - evalStartTime
      console.error(
        `❌ ${config.name} evaluation failed after ${(evalDuration / 1000).toFixed(1)}s:`,
        error
      )
      results.push({
        name: config.name,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        duration: evalDuration,
      })
    }
  }

  const totalDuration = Date.now() - startTime

  // Report results
  console.log('\n' + '='.repeat(60))
  console.log('EVAL SET RESULTS')
  console.log('='.repeat(60))

  let successCount = 0
  let failureCount = 0

  results.forEach((result) => {
    if (result.status === 'success') {
      successCount++
      console.log(
        `✅ ${result.name}: SUCCESS (${(result.duration / 1000).toFixed(1)}s)`
      )
      if (result.result?.overall_metrics) {
        const metrics = result.result.overall_metrics
        console.log(
          `   Overall Score: ${metrics.average_overall.toFixed(2)}/10`
        )
        console.log(
          `   Completion: ${metrics.average_completion.toFixed(2)}/10`
        )
        console.log(
          `   Efficiency: ${metrics.average_efficiency.toFixed(2)}/10`
        )
        console.log(
          `   Code Quality: ${metrics.average_code_quality.toFixed(2)}/10`
        )
        console.log(
          `   Runs: ${metrics.successful_runs}/${metrics.total_runs} successful`
        )
      }
    } else {
      failureCount++
      console.log(
        `❌ ${result.name}: FAILED (${(result.duration / 1000).toFixed(1)}s)`
      )
      console.log(`   Error: ${result.error}`)
    }
  })

  console.log('='.repeat(60))
  console.log(`Total time: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`Success: ${successCount}/${evalConfigs.length}`)
  console.log(`Failure: ${failureCount}/${evalConfigs.length}`)

  // Send email summary if we have successful results with analyses
  const successfulResults = results.filter(
    (r) => r.status === 'success' && r.result && r.analysis
  )
  if (successfulResults.length > 0) {
    console.log('\n📧 Sending eval results email...')
    try {
      const evalResults = successfulResults
        .map((r) => r.result!)
        .filter(Boolean)
      const analyses = successfulResults.map((r) => r.analysis!).filter(Boolean)

      const emailSent = await sendEvalResultsEmail(evalResults, analyses)
      if (emailSent) {
        console.log('✅ Eval results email sent successfully!')
      } else {
        console.log(
          '⚠️ Email sending was skipped (likely missing configuration)'
        )
      }
    } catch (emailError) {
      console.error('❌ Failed to send eval results email:', emailError)
    }
  } else {
    console.log(
      '\n📧 Skipping email - no successful results with analyses to send'
    )
  }

  if (failureCount > 0) {
    console.log(
      '\n⚠️  Some evaluations failed. Check the logs above for details.'
    )
    process.exit(1)
  } else {
    console.log('\n🎉 All evaluations completed successfully!')
    process.exit(0)
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  console.info('Usage: bun run run-eval-set [output-dir]')

  const outputDir = args[0] || DEFAULT_OUTPUT_DIR

  runEvalSet(outputDir).catch((err) => {
    console.error('Error running eval set:', err)
    process.exit(1)
  })
}

export { runEvalSet }
