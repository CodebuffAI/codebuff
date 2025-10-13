import type { JudgingResult } from './judge'
import type { EvalCommitV2 } from './types'

export function formatAgentResult(params: {
  agentId: string
  commit: EvalCommitV2
  judging: JudgingResult
  cost: number
  durationMs: number
  error?: string
  traceFilePath?: string
  agentNumber: number
  totalAgents: number
}): string {
  const {
    agentId,
    commit,
    judging,
    cost,
    durationMs,
    error,
    traceFilePath,
    agentNumber,
    totalAgents,
  } = params

  const lines: string[] = []
  const minorSeparator = '-'.repeat(80)

  lines.push('')
  lines.push(minorSeparator)
  lines.push(`AGENT ${agentNumber}/${totalAgents}: [${agentId}]`)
  lines.push(minorSeparator)
  lines.push('')

  lines.push('TASK:')
  lines.push(minorSeparator)
  lines.push(commit.prompt)
  lines.push('')

  if (error) {
    lines.push('❌ ERROR:')
    lines.push(minorSeparator)
    lines.push(error)
    lines.push('')
  }

  lines.push('JUDGING RESULTS:')
  lines.push(minorSeparator)
  lines.push('')
  lines.push('Scores:')
  lines.push(`  Overall Score:       ${judging.overallScore.toFixed(1)}/10`)
  lines.push(`  Completion Score:    ${judging.completionScore.toFixed(1)}/10`)
  lines.push(`  Code Quality Score:  ${judging.codeQualityScore.toFixed(1)}/10`)
  lines.push('')

  lines.push('Analysis:')
  lines.push(judging.analysis)
  lines.push('')

  if (judging.strengths.length > 0) {
    lines.push('Strengths:')
    judging.strengths.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s}`)
    })
    lines.push('')
  }

  if (judging.weaknesses.length > 0) {
    lines.push('Weaknesses:')
    judging.weaknesses.forEach((w, i) => {
      lines.push(`  ${i + 1}. ${w}`)
    })
    lines.push('')
  }

  lines.push('METRICS:')
  lines.push(minorSeparator)
  lines.push(`  Duration: ${(durationMs / 1000).toFixed(1)}s`)
  lines.push(`  Cost:     $${cost.toFixed(4)}`)
  lines.push('')

  if (traceFilePath) {
    lines.push(`Trace saved to: ${traceFilePath}`)
    lines.push('')
  }

  return lines.join('\n')
}

export function formatTraceAnalysis(params: {
  commit: EvalCommitV2
  overallAnalysis: string
  agentFeedback: Array<{
    agentId: string
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
  }>
}): string {
  const { commit, overallAnalysis, agentFeedback } = params

  const lines: string[] = []
  const separator = '='.repeat(80)
  const minorSeparator = '-'.repeat(80)

  lines.push('')
  lines.push(separator)
  lines.push(`TRACE ANALYSIS: ${commit.id} (${commit.sha.slice(0, 7)})`)
  lines.push(separator)
  lines.push('')

  lines.push('OVERALL ANALYSIS:')
  lines.push(minorSeparator)
  lines.push(overallAnalysis)
  lines.push('')

  if (agentFeedback.length > 0) {
    lines.push('AGENT-SPECIFIC FEEDBACK:')
    lines.push(minorSeparator)

    agentFeedback.forEach((feedback, index) => {
      if (index > 0) lines.push('')

      lines.push(`[${feedback.agentId}]`)

      if (feedback.strengths.length > 0) {
        lines.push('  Strengths:')
        feedback.strengths.forEach((s) => lines.push(`    • ${s}`))
      }

      if (feedback.weaknesses.length > 0) {
        lines.push('  Weaknesses:')
        feedback.weaknesses.forEach((w) => lines.push(`    • ${w}`))
      }

      if (feedback.recommendations.length > 0) {
        lines.push('  Recommendations:')
        feedback.recommendations.forEach((r) => lines.push(`    • ${r}`))
      }
    })

    lines.push('')
  }

  lines.push(separator)
  lines.push('')

  return lines.join('\n')
}
