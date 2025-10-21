import { disableLiveUserInputCheck } from '@codebuff/agent-runtime/live-user-inputs'
import { countTokens } from '@codebuff/agent-runtime/util/token-counter'
import { promptAiSdkStructured } from '@codebuff/backend/llm-apis/vercel-ai-sdk/ai-sdk'
import { models } from '@codebuff/common/old-constants'
import { generateCompactId } from '@codebuff/common/util/string'
import { z } from 'zod/v4'

import type { FullEvalLog } from './types'

const MAX_TOKENS = 1_000_000 // 1 million token limit

const ProblemSchema = z.object({
  title: z.string().describe('Short sentence describing the issue'),
  description: z
    .string()
    .describe(
      'Longer paragraph or two describing the issue and specific cases where it happened',
    ),
  severity: z
    .enum(['critical', 'high', 'medium', 'low'])
    .describe('How important this problem is to fix'),
  frequency: z
    .number()
    .min(0)
    .max(1)
    .describe('What fraction of tasks were affected by this problem (0-1)'),
  examples: z
    .array(z.string())
    .describe(
      'Specific examples from the eval runs where this problem occurred',
    ),
})

export const PostEvalAnalysisSchema = z.object({
  summary: z
    .string()
    .describe('Overall summary of the eval results and key findings'),
  problems: z
    .array(ProblemSchema)
    .describe(
      'Priority-ordered list of problems to solve, most important first',
    ),
  recommendations: z
    .array(z.string())
    .describe('Specific development recommendations based on the analysis'),
})

export type PostEvalAnalysis = z.infer<typeof PostEvalAnalysisSchema>

function buildAnalysisPrompt(evalResult: FullEvalLog): string {
  // Build summary of overall metrics
  const metrics = evalResult.overall_metrics
  const metricsSection = `
Overall Performance Metrics:
- Average Completion Score: ${metrics.average_completion.toFixed(2)}/10
- Average Code Quality Score: ${metrics.average_code_quality.toFixed(2)}/10
- Average Overall Score: ${metrics.average_overall.toFixed(2)}/10
- Average Duration: ${(metrics.average_duration_ms / 1000).toFixed(1)} seconds
- Success Rate: ${metrics.successful_runs}/${metrics.total_runs} (${((metrics.successful_runs / metrics.total_runs) * 100).toFixed(1)}%)
`

  // Build detailed analysis of each eval run
  const evalRunsSection = evalResult.eval_runs
    .map((run, index) => {
      const judging = run.judging_results
      const durationSeconds = (run.durationMs / 1000).toFixed(1)

      return `
=== Eval Run ${index + 1}: ${run.eval_commit.spec.split('\n')[0]} ===
Spec: ${run.eval_commit.spec}
Duration: ${durationSeconds}s
Error: ${run.error || 'None'}

Scores:
- Completion: ${judging.metrics.completionScore}/10
- Code Quality: ${judging.metrics.codeQualityScore}/10
- Overall: ${judging.metrics.overallScore}/10

Judge Analysis: ${judging.analysis}

Strengths: ${judging.strengths.join('; ')}
Weaknesses: ${judging.weaknesses.join('; ')}

Files Changed by Codebuff: ${run.gitDiff || 'None'}
Ground Truth Files: ${run.eval_commit.fileStates.map((f) => f.path).join(', ')}

Trace Summary: ${run.trace.length} conversation turns
${run.trace.map((t, i) => `Turn ${i + 1}: "${t.prompt}" -> ${t.steps.length} steps`).join('\n')}
`
    })
    .join('\n')

  return `You are an expert software engineering manager analyzing the performance of Codebuff, an AI coding assistant. You have been given the results of a comprehensive evaluation where Codebuff attempted to implement various coding tasks.

Your goal is to identify the most important problems that need to be solved to improve Codebuff's performance, prioritized by impact and frequency. Focus on actionable development priorities that the engineering team can work on.

${metricsSection}

${evalRunsSection}

Please analyze these results and provide:

1. A summary of the overall performance and key patterns
2. A priority-ordered list of specific problems to solve (most important first)
3. Specific development recommendations

For each problem, consider:
- How frequently it occurs across tasks
- How severely it impacts performance
- How actionable it is for the development team
- Specific examples from the eval runs

Focus on systemic issues before one-off, smaller problems. Look for patterns in the judge analyses, weaknesses, and failure modes.`
}

// Warning: this function completely vibe-coded, probably wrong.
function truncatePromptIfNeeded(prompt: string, maxTokens: number): string {
  const tokenCount = countTokens(prompt)

  if (tokenCount <= maxTokens) {
    return prompt
  }

  // If too long, truncate the detailed eval runs section while keeping the summary
  const lines = prompt.split('\n')
  const metricsEndIndex = lines.findIndex((line) =>
    line.includes('=== Eval Run 1:'),
  )

  if (metricsEndIndex === -1) {
    // Fallback: just truncate from the end
    const words = prompt.split(' ')
    const targetWords = Math.floor((words.length * maxTokens) / tokenCount)
    return (
      words.slice(0, targetWords).join(' ') +
      '\n\n[TRUNCATED: Content reduced to fit token limit]'
    )
  }

  // Keep the intro and metrics, but limit the detailed runs
  const intro = lines.slice(0, metricsEndIndex).join('\n')
  const evalRunsLines = lines.slice(metricsEndIndex)

  // Calculate how many tokens we have left for eval runs
  const introTokens = countTokens(intro)
  const remainingTokens = maxTokens - introTokens - 100 // Reserve 100 for truncation notice

  if (remainingTokens <= 0) {
    return intro + '\n\n[TRUNCATED: Eval runs removed to fit token limit]'
  }

  // Truncate eval runs to fit
  const evalRunsText = evalRunsLines.join('\n')
  const evalRunsWords = evalRunsText.split(' ')
  const targetEvalWords = Math.floor(
    (evalRunsWords.length * remainingTokens) / countTokens(evalRunsText),
  )

  const truncatedEvalRuns = evalRunsWords.slice(0, targetEvalWords).join(' ')

  return (
    intro +
    '\n' +
    truncatedEvalRuns +
    '\n\n[TRUNCATED: Some eval run details removed to fit token limit]'
  )
}

/**
 * Analyzes eval results to identify priority problems for Codebuff development
 * @param evalResult The complete eval results from running git evals
 * @returns Analysis with prioritized list of problems to solve
 */
export async function analyzeEvalResults(
  evalResult: FullEvalLog,
): Promise<PostEvalAnalysis> {
  const prompt = buildAnalysisPrompt(evalResult)
  const finalPrompt = truncatePromptIfNeeded(prompt, MAX_TOKENS)

  const tokenCount = countTokens(finalPrompt)
  console.log(`Post-eval analysis prompt: ${tokenCount} tokens`)

  disableLiveUserInputCheck()
  return promptAiSdkStructured({
    messages: [{ role: 'user', content: finalPrompt }],
    schema: PostEvalAnalysisSchema,
    model: models.openrouter_gemini2_5_pro_preview,
    clientSessionId: generateCompactId(),
    fingerprintId: generateCompactId(),
    userInputId: generateCompactId(),
    userId: undefined,
    timeout: 10 * 60 * 1000, // 10 minute timeout
    sendAction: () => {},
    liveUserInputRecord: {},
    sessionConnections: {},
    logger: console,
    trackEvent: () => {},
  })
}
