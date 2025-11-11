import path from 'path'

import { sendBasicEmail } from '@codebuff/internal/loops'

import { runBuffBench } from './run-buffbench'
import type { AgentEvalResults } from './types'
import type { MetaAnalysisResult } from './meta-analyzer'

async function main() {
  console.log('Starting nightly buffbench evaluation...')
  console.log('Eval set: codebuff')
  console.log()

  const results = await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base2-fast', 'base2-fast-no-validation'],
    taskConcurrency: 5,
  })

  console.log('\nNightly buffbench evaluation completed successfully!')

  // Send email with results
  const recipientEmail = process.env.EVAL_RESULTS_EMAIL || 'team@codebuff.com'
  console.log(`\n📧 Sending buffbench results email to ${recipientEmail}...`)

  const { metadata, metaAnalysis, ...agentResults } = results
  const emailContent = formatBuffBenchEmailContent(
    agentResults,
    metadata,
    metaAnalysis,
  )

  try {
    const emailResult = await sendBasicEmail({
      email: recipientEmail,
      data: emailContent,
      logger: console,
    })

    if (emailResult.success) {
      console.log('✅ BuffBench results email sent successfully!')
    } else {
      console.log('⚠️ Email sending was skipped (likely missing configuration)')
    }
  } catch (emailError) {
    console.error('❌ Failed to send buffbench results email:', emailError)
  }

  process.exit(0)
}

function formatBuffBenchEmailContent(
  results: Record<string, AgentEvalResults>,
  metadata: any,
  metaAnalysis?: MetaAnalysisResult,
) {
  const agents = Object.keys(results)
  const date = new Date().toLocaleDateString()

  const agentScores = agents
    .map((agentId) => `${agentId}: ${results[agentId].averageScore.toFixed(1)}`)
    .join(' | ')

  const subject = `Nightly BuffBench Results - ${date} - ${agentScores}`

  const agentComparison = agents
    .map(
      (agentId) =>
        `${agentId}:
  - Average Score: ${results[agentId].averageScore.toFixed(2)}/10
  - Average Cost: ${results[agentId].averageCost.toFixed(4)}
  - Average Duration: ${(results[agentId].averageDuration / 1000).toFixed(1)}s
  - Valid Runs: ${results[agentId].runs.length}`,
    )
    .join('\n\n')

  let message = `📊 NIGHTLY BUFFBENCH RESULTS

📈 AGENT RESULTS:
${agentComparison}

📁 Results Location: ${metadata.logsDirectory}
⏱️  Total Evaluation Time: ${(metadata.totalDuration / 1000 / 60).toFixed(1)} minutes
• Total Tasks: ${metadata.commitsEvaluated}
• Agents Tested: ${agents.join(', ')}

Generated on: ${metadata.timestamp}
Repository: ${metadata.repoUrl}`

  if (metaAnalysis) {
    message += `

🔍 META-ANALYSIS

Overall Comparison:
${metaAnalysis.overallComparison}`

    if (metaAnalysis.agentInsights.length > 0) {
      message += `\n\nAgent-Specific Insights:`
      for (const insight of metaAnalysis.agentInsights) {
        message += `\n\n[${insight.agentId}]`
        if (insight.consistentStrengths.length > 0) {
          message += `\n  Strengths: ${insight.consistentStrengths.join(', ')}`
        }
        if (insight.consistentWeaknesses.length > 0) {
          message += `\n  Weaknesses: ${insight.consistentWeaknesses.join(', ')}`
        }
        if (insight.recommendations.length > 0) {
          message += `\n  Recommendations:`
          insight.recommendations.forEach((rec) => {
            message += `\n    • ${rec}`
          })
        }
      }
    }

    if (metaAnalysis.keyFindings.length > 0) {
      message += `\n\nKey Findings:`
      metaAnalysis.keyFindings.forEach((finding, i) => {
        message += `\n  ${i + 1}. ${finding}`
      })
    }
  }

  return { subject, message }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running nightly buffbench:', error)
    process.exit(1)
  })
}
