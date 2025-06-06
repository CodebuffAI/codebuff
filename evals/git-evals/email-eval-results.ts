import { sendBasicEmail } from '../../packages/internal/src/loops'
import { FullEvalLog } from './types'
import { PostEvalAnalysis } from './post-eval-analysis'

/**
 * Formats eval results and analysis into email-friendly content
 */
function formatEvalSummaryForEmail(
  evalResults: FullEvalLog[],
  analyses: PostEvalAnalysis[]
): {
  subject: string
  message: string
} {
  // Calculate overall metrics across all eval sets
  const totalRuns = evalResults.reduce(
    (sum, result) => sum + result.overall_metrics.total_runs,
    0
  )
  const successfulRuns = evalResults.reduce(
    (sum, result) => sum + result.overall_metrics.successful_runs,
    0
  )
  const avgOverallScore =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_overall,
      0
    ) / evalResults.length
  const avgCompletion =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_completion,
      0
    ) / evalResults.length
  const avgEfficiency =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_efficiency,
      0
    ) / evalResults.length
  const avgCodeQuality =
    evalResults.reduce(
      (sum, result) => sum + result.overall_metrics.average_code_quality,
      0
    ) / evalResults.length

  const subject = `Codebuff Eval Results - ${new Date().toLocaleDateString()} - Overall Score: ${avgOverallScore.toFixed(1)}/10`

  // Build the complete message as a single string
  const summary = analyses.map((analysis) => analysis.summary).join('\n\n')

  const metrics = `📊 OVERALL METRICS
• Success Rate: ${successfulRuns}/${totalRuns} (${((successfulRuns / totalRuns) * 100).toFixed(1)}%)
• Overall Score: ${avgOverallScore.toFixed(2)}/10
• Completion: ${avgCompletion.toFixed(2)}/10
• Efficiency: ${avgEfficiency.toFixed(2)}/10
• Code Quality: ${avgCodeQuality.toFixed(2)}/10

📈 BY EVAL SET:
${evalResults
  .map(
    (result) => `${result.test_repo_name}:
  - Success: ${result.overall_metrics.successful_runs}/${result.overall_metrics.total_runs}
  - Overall: ${result.overall_metrics.average_overall.toFixed(1)}/10
  - Completion: ${result.overall_metrics.average_completion.toFixed(1)}/10`
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
      }))
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
      i
    ) => `${i + 1}. [${problem.severity.toUpperCase()}] ${problem.title}
   Frequency: ${(problem.frequency * 100).toFixed(1)}%
   ${problem.description}`
  )
  .join('\n\n')}`

  const allRecommendations = analyses.flatMap(
    (analysis) => analysis.recommendations
  )
  const uniqueRecommendations = [...new Set(allRecommendations)]

  const recommendations = `💡 DEVELOPMENT RECOMMENDATIONS:
${uniqueRecommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}`

  // Combine everything into a single message
  const message = `${summary}

${metrics}

${topProblems}

${recommendations}

Generated on: ${new Date().toISOString()}
Total Eval Sets: ${evalResults.length}
Total Runs: ${totalRuns}`

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
  recipientEmail: string = process.env.EVAL_RESULTS_EMAIL || 'team@codebuff.com'
): Promise<boolean> {
  const emailContent = formatEvalSummaryForEmail(evalResults, analyses)

  console.log(`📧 Sending eval results email to ${recipientEmail}...`)
  const result = await sendBasicEmail(recipientEmail, emailContent)
  return result.success
}
