import { sendBasicEmail } from '@codebuff/internal/loops'

import type { PostEvalAnalysis } from './post-eval-analysis'
import type { FullEvalLog } from './types'

/**
 * Formats eval results and analysis into email-friendly content
 */
function formatEvalSummaryForEmail(
  evalResults: FullEvalLog[],
  analyses: PostEvalAnalysis[],
  title?: string,
): {
  subject: string
  message: string
} {
  // Calculate overall metrics across all eval sets
  const totalRuns = evalResults.reduce(
    (sum, result) => sum + result.overall_metrics.total_runs,
    0,
  )
  const successfulRuns = evalResults.reduce(
    (sum, result) => sum + result.overall_metrics.successful_runs,
    0,
  )
  const avgOverallScore =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_overall,
      0,
    ) / evalResults.length
  const avgCompletion =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_completion,
      0,
    ) / evalResults.length
  const avgEfficiency =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_efficiency,
      0,
    ) / evalResults.length
  const avgCodeQuality =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_code_quality,
      0,
    ) / evalResults.length
  const avgCostUsd =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_cost_usd,
      0,
    ) / evalResults.length
  const totalCostUsd = evalResults.reduce(
    (sum, result) =>
      sum +
      result.overall_metrics.average_cost_usd *
        result.overall_metrics.total_runs,
    0,
  )
  const avgRuntimeSec =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_runtime_sec,
      0,
    ) / evalResults.length

  const subject = `Codebuff Eval Results - ${title ? title : new Date().toLocaleDateString()} - Score: ${avgOverallScore.toFixed(1)}/10 | Cost: ${avgCostUsd.toFixed(3)} | ${avgRuntimeSec.toFixed(1)}s`

  // Build the complete message as a single string
  const summary = analyses.map((analysis) => analysis.summary).join('\n\n')

  const metrics = `📊 OVERALL METRICS
• Success Rate: ${successfulRuns}/${totalRuns} (${((successfulRuns / totalRuns) * 100).toFixed(1)}%)
• Overall Score: ${avgOverallScore.toFixed(2)}/10
• Completion: ${avgCompletion.toFixed(2)}/10
• Efficiency: ${avgEfficiency.toFixed(2)}/10
• Code Quality: ${avgCodeQuality.toFixed(2)}/10

💰 COST & PERFORMANCE METRICS
• Average Cost per Run: ${avgCostUsd.toFixed(4)}
• Total Cost: ${totalCostUsd.toFixed(2)}
• Average Runtime: ${avgRuntimeSec.toFixed(1)} seconds
• Cost per Point (Overall Score): ${(avgCostUsd / avgOverallScore).toFixed(4)}

📈 BY EVAL SET:
${evalResults
  .map(
    (result) => `${result.test_repo_name}:
  - Success: ${result.overall_metrics.successful_runs}/${result.overall_metrics.total_runs}
  - Overall: ${result.overall_metrics.average_overall.toFixed(1)}/10
  - Completion: ${result.overall_metrics.average_completion.toFixed(1)}/10
  - Avg Cost: ${result.overall_metrics.average_cost_usd.toFixed(4)}
  - Avg Runtime: ${result.overall_metrics.average_runtime_sec.toFixed(1)}s`,
  )
  .join('\n')}`

  // Collect all problems and sort by severity and frequency
  const allProblems = analyses
    .flatMap((analysis) =>
      analysis.problems.map((problem) => ({
        ...problem,
        severityWeight: { critical: 4, high: 3, medium: 2, low: 1 }[
          problem.severity
        ],
      })),
    )
    .sort((a, b) => {
      if (a.severityWeight !== b.severityWeight) {
        return b.severityWeight - a.severityWeight
      }
      return b.frequency - a.frequency
    })

  const topProblems = `🚨 TOP PROBLEMS TO SOLVE:
${allProblems
  .map(
    (
      problem,
      i,
    ) => `${i + 1}. [${problem.severity.toUpperCase()}] ${problem.title}
   Frequency: ${(problem.frequency * 100).toFixed(1)}%
   ${problem.description}`,
  )
  .join('\n\n')}`

  const allRecommendations = analyses.flatMap(
    (analysis) => analysis.recommendations,
  )
  const uniqueRecommendations = [...new Set(allRecommendations)]

  const recommendations = `💡 DEVELOPMENT RECOMMENDATIONS:
${uniqueRecommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}`

  // Add detailed cost breakdown section
  const costBreakdown = `💸 DETAILED COST BREAKDOWN
${evalResults
  .map((result) => {
    const setCost =
      result.overall_metrics.average_cost_usd *
      result.overall_metrics.total_runs
    const costPerSuccessfulRun =
      result.overall_metrics.successful_runs > 0
        ? setCost / result.overall_metrics.successful_runs
        : 0
    return `${result.test_repo_name}:
  - Total Set Cost: ${setCost.toFixed(3)}
  - Cost per Run: ${result.overall_metrics.average_cost_usd.toFixed(4)}
  - Cost per Successful Run: ${costPerSuccessfulRun.toFixed(4)}
  - Runtime Efficiency: ${result.overall_metrics.average_runtime_sec > 0 ? (result.overall_metrics.average_overall / result.overall_metrics.average_runtime_sec).toFixed(3) : 'N/A'} points/sec`
  })
  .join('\n')}`

  // Combine everything into a single message
  const message = `${summary}

${metrics}

${costBreakdown}

${topProblems}

${recommendations}

Generated on: ${new Date().toISOString()}
Total Eval Sets: ${evalResults.length}
Total Runs: ${totalRuns}
Total Budget Used: $${totalCostUsd.toFixed(2)}`

  return {
    subject,
    message,
  }
}

/**
 * Sends eval results summary email via Loops
 */
export async function sendEvalResultsEmail(
  evalResults: FullEvalLog[],
  analyses: PostEvalAnalysis[],
  recipientEmail: string = process.env.EVAL_RESULTS_EMAIL ||
    'team@codebuff.com',
  title?: string,
): Promise<boolean> {
  console.log(`📧 Sending eval results email to ${recipientEmail}...`)
  const emailContent = formatEvalSummaryForEmail(evalResults, analyses, title)
  const result = await sendBasicEmail(recipientEmail, emailContent)
  return result.success
}
