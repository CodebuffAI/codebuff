import path from 'path'

import { sendBasicEmail } from '@codebuff/internal/loops'

import { runBuffBench } from './run-buffbench'
import type { AgentEvalResults } from './types'

async function main() {
  console.log('Starting nightly buffbench evaluation...')
  console.log('Agents: base, base2')
  console.log('Eval set: codebuff')
  console.log()

  const results = await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base', 'base2-fast'],
    taskConcurrency: 5,
  })

  console.log('\nNightly buffbench evaluation completed successfully!')

  // Send email with results
  const recipientEmail = process.env.EVAL_RESULTS_EMAIL || 'team@codebuff.com'
  console.log(`\n📧 Sending buffbench results email to ${recipientEmail}...`)

  const { metadata, ...agentResults } = results
  const emailContent = formatBuffBenchEmailContent(agentResults, metadata)

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

  const message = `📊 NIGHTLY BUFFBENCH RESULTS

📈 AGENT RESULTS:
${agentComparison}

📁 Results Location: ${metadata.logsDirectory}
⏱️  Total Evaluation Time: ${(metadata.totalDuration / 1000 / 60).toFixed(1)} minutes
• Total Tasks: ${metadata.commitsEvaluated}
• Agents Tested: ${agents.join(', ')}

Generated on: ${metadata.timestamp}
Repository: ${metadata.repoUrl}`

  return { subject, message }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running nightly buffbench:', error)
    process.exit(1)
  })
}
