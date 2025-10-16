import path from 'path'

import { sendBasicEmail } from '@codebuff/internal/loops'

import { runBuffBench } from './run-buffbench'
import type { MetaAnalysisResult } from './meta-analyzer'
import type { AgentEvalResults } from './types'

async function main() {
  console.log('Starting nightly buffbench evaluation...')
  console.log('Agents: base, base2')
  console.log('Eval set: codebuff')
  console.log()

  const results = await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base', 'base2'],
    taskConcurrency: 20,
  })

  console.log('\nNightly buffbench evaluation completed successfully!')

  // Send email with results
  const recipientEmail = process.env.EVAL_RESULTS_EMAIL || 'team@codebuff.com'
  console.log(`\n📧 Sending buffbench results email to ${recipientEmail}...`)

  const { metadata, metaAnalysis, ...agentResults } = results
  const emailContent = formatBuffBenchEmailContent(agentResults, metadata, metaAnalysis)

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
  metaAnalysis: MetaAnalysisResult,
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

  // Add meta-analysis if available
  if (metaAnalysis) {
    message += '\n\n' + formatMetaAnalysis(metaAnalysis)
  }

  return { subject, message }
}

function formatMetaAnalysis(metaAnalysis: MetaAnalysisResult): string {
  const lines: string[] = []
  const separator = '═'.repeat(60)
  const minorSeparator = '─'.repeat(60)

  lines.push(separator)
  lines.push('🔍 META-ANALYSIS: PATTERNS ACROSS ALL TASKS')
  lines.push(separator)
  lines.push('')

  // Overall comparison
  lines.push('📊 OVERALL COMPARISON:')
  lines.push(minorSeparator)
  lines.push(metaAnalysis.overallComparison)
  lines.push('')

  // Agent-specific insights
  if (metaAnalysis.agentInsights && metaAnalysis.agentInsights.length > 0) {
    lines.push('🤖 AGENT-SPECIFIC INSIGHTS:')
    lines.push(minorSeparator)

    for (const insight of metaAnalysis.agentInsights) {
      lines.push('')
      lines.push(`[${insight.agentId}]`)
      lines.push('')

      if (insight.performanceSummary) {
        lines.push(`Performance: ${insight.performanceSummary}`)
        lines.push('')
      }

      if (insight.consistentStrengths?.length > 0) {
        lines.push('✅ Consistent Strengths:')
        insight.consistentStrengths.forEach((s: string) => {
          lines.push(`  • ${s}`)
        })
        lines.push('')
      }

      if (insight.consistentWeaknesses?.length > 0) {
        lines.push('⚠️  Consistent Weaknesses:')
        insight.consistentWeaknesses.forEach((w: string) => {
          lines.push(`  • ${w}`)
        })
        lines.push('')
      }

      if (insight.recommendations?.length > 0) {
        lines.push('💡 Recommendations:')
        insight.recommendations.forEach((r: string) => {
          lines.push(`  • ${r}`)
        })
        lines.push('')
      }
    }
  }

  // Key findings
  if (metaAnalysis.keyFindings && metaAnalysis.keyFindings.length > 0) {
    lines.push('🎯 KEY FINDINGS & PRIORITIES:')
    lines.push(minorSeparator)
    metaAnalysis.keyFindings.forEach((finding: string, index: number) => {
      lines.push(`${index + 1}. ${finding}`)
    })
    lines.push('')
  }

  lines.push(separator)

  return lines.join('\n')
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running nightly buffbench:', error)
    process.exit(1)
  })
}
