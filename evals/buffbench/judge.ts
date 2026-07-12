import fs from 'fs'
import path from 'path'

import { withTimeout } from '@codebuff/common/util/promise'
import { z } from 'zod/v4'

import {
  clampScoresByDeterministicSignals,
  computeDeterministicSignals,
} from './deterministic-signals'
import type { EvalCommitV2, FinalCheckOutput } from './types'
import type { AgentDefinition, OpenbuffClient } from '@openbuff/sdk'

const DEBUG_ERROR = true

export const ScoringStatusSchema = z.enum([
  'scored',
  'all_judges_failed',
  'partial_judge_failure',
])

/**
 * Scoring status carried alongside {@link JudgingResult} scores.
 *
 * - `'scored'` (default when absent): at least one judge produced structured
 *   output and the scores reflect a real measurement.
 * - `'all_judges_failed'`: NO judge produced structured output — the returned
 *   scores are synthetic all-zeros and must NOT be treated as a measured 0/10.
 * - `'partial_judge_failure'`: SOME (but not all) judges failed; the scores are
 *   still derived from the judges that succeeded, but are noisier than usual.
 *
 * Back-compat: the field is optional, so old trace files (which predate it)
 * default to `'scored'` for downstream consumers.
 */
export type ScoringStatus = z.infer<typeof ScoringStatusSchema>

export const JudgingResultSchema = z.object({
  analysis: z
    .string()
    .describe('Detailed analysis comparing agent changes to ground truth'),
  strengths: z
    .array(z.string())
    .describe('Key strengths of the implementation'),
  weaknesses: z.array(z.string()).describe('Key weaknesses or issues found'),
  completionScore: z
    .number()
    .min(0)
    .max(10)
    .describe('How completely the prompt was addressed'),
  codeQualityScore: z
    .number()
    .min(0)
    .max(10)
    .describe('Code structure and maintainability'),
  overallScore: z.number().min(0).max(10).describe('Combined assessment'),
  idiomScore: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe('Language-specific idiom compliance when relevant'),
  nonIdiomaticPatternsDetected: z
    .array(z.string())
    .optional()
    .describe('Concrete non-idiomatic patterns observed in the implementation'),
  scoringStatus: ScoringStatusSchema.optional().describe(
    'Whether the scores were actually measured by the judges, or are synthetic (all judges failed). Absent => scored for back-compat.',
  ),
})

export type JudgingResult = z.infer<typeof JudgingResultSchema>

const judgeAgentBase: Omit<AgentDefinition, 'id' | 'model'> = {
  displayName: 'Judge',
  toolNames: ['set_output'],
  inputSchema: {
    prompt: { type: 'string', description: 'The evaluation prompt' },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      analysis: {
        type: 'string',
        description:
          'Detailed analysis comparing agent changes to ground truth',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key strengths of the implementation',
      },
      weaknesses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key weaknesses or issues found',
      },
      completionScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'How completely the prompt was addressed',
      },
      codeQualityScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'Code structure and maintainability',
      },
      overallScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'Combined assessment',
      },
      idiomScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description:
          'Language-specific idiom compliance when relevant. Optional; omit when the task does not involve non-TypeScript language idioms.',
      },
      nonIdiomaticPatternsDetected: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Concrete non-idiomatic patterns observed in the implementation, such as unnecessary unwraps, unclosed files, or non-standard library usage. Optional; omit or leave empty when none are observed.',
      },
      scoringStatus: {
        type: 'string',
        enum: ['scored', 'all_judges_failed', 'partial_judge_failure'],
        description:
          'Whether the scores were actually measured by the judges, or are synthetic (all judges failed). Optional; omit if unsure.',
      },
    },
    // scoringStatus is intentionally NOT required — the judge agent is unlikely
    // to populate it, and our code defaults the absent value to 'scored'.
    required: [
      'analysis',
      'strengths',
      'weaknesses',
      'completionScore',
      'codeQualityScore',
      'overallScore',
    ],
  },
  systemPrompt: `You are an expert software engineer evaluating AI-generated code changes with empathy for the task given.

## Your Role

You will receive:
1. The user prompt that the coding agent was given
2. The generated task specification that defines the expected outcome
3. Context files from the codebase
4. The ground truth changes (expected outcome)
5. The agent's actual changes

## Evaluation Philosophy

**Judge based on what the agent was asked to do, not on perfection.**

- If the prompt is vague or high-level (e.g., "add authentication"), be lenient and accept any reasonable implementation that achieves the goal
- If the prompt or task specification is specific and detailed, expect the implementation to match those details more closely
- Focus on whether the agent understood and addressed the user's intent and the task specification
- Consider that there are often multiple valid ways to implement the same feature

## Evaluation Criteria

- **Completion** (0-10): How well did the agent address what was asked in the prompt? Consider the specificity of the prompt.
- **Code Quality** (0-10): How well-structured and maintainable is the code?
- **Idiom Compliance** (0-10, optional): For non-TypeScript language tasks, how well does the implementation follow that language's idioms and avoid cross-language habits?
- **Overall** (0-10): Combined assessment of whether the agent successfully completed the task as requested

## Ground Truth

The ground truth shows ONE valid implementation, but it's not the only correct answer. The agent's implementation should be judged on:
- Does it achieve the same functional outcome?
- Is it a reasonable approach given the prompt?
- Does it maintain code quality?

Provide detailed analysis, strengths, weaknesses, and numerical scores.`,
}

const judgeAgents: Record<string, AgentDefinition> = {
  'judge-gpt': {
    id: 'judge-gpt',
    model: 'openai/gpt-5.4',
    ...judgeAgentBase,
  },
  'judge-gemini': {
    id: 'judge-gemini',
    model: 'google/gemini-3.1-pro-preview',
    ...judgeAgentBase,
  },
  'judge-sonnet': {
    id: 'judge-claude',
    model: 'anthropic/claude-sonnet-4.6',
    ...judgeAgentBase,
  },
}

interface JudgeCommitResultInput {
  client: OpenbuffClient
  commit: EvalCommitV2
  contextFiles: Record<string, string>
  agentDiff: string
  error?: string
  finalCheckOutputs?: string
  /**
   * Structured final-check outputs (per-command exit codes). When provided,
   * deterministic signals (compile/test/lint pass/fail) are derived and used
   * to clamp the LLM judge's scores — so a broken build can never score 7/10.
   * `finalCheckOutputs` (string) is still used for the LLM prompt text.
   */
  finalCheckOutputsStructured?: FinalCheckOutput[]
}

async function runSingleJudge(
  input: JudgeCommitResultInput,
  judgePrompt: string,
  judgeAgentId: string,
): Promise<JudgingResult | null> {
  const { client } = input

  const judgeAgent = judgeAgents[judgeAgentId]
  const agentOutput: string[] = []
  try {
    const judgeResult = await withTimeout(
      client.run({
        agent: judgeAgent.id,
        prompt: judgePrompt,
        agentDefinitions: Object.values(judgeAgents),
        handleEvent: (event) => {
          if (event.type === 'text') {
            agentOutput.push(event.text)
          } else if (event.type === 'tool_call') {
            agentOutput.push(JSON.stringify(event, null, 2))
          } else if (event.type === 'error') {
            console.warn(`[Judge ${judgeAgentId}] Error event:`, event.message)
          }
        },
      }),
      20 * 60 * 1000,
      'Judge agent timed out after 20 minutes',
    )

    if (judgeResult.output.type !== 'structuredOutput') {
      console.error(
        `Judge ${judgeAgentId} - not structured output`,
        JSON.stringify(judgeResult.output, null, 2),
      )
      console.error(
        'Judge agent output:',
        JSON.stringify(judgeResult.output, null, 2),
        'Judge agent output trace:',
        agentOutput.join(''),
      )
      if (DEBUG_ERROR) {
        fs.writeFileSync(
          path.join(
            __dirname,
            '..',
            `${input.commit.id}-${judgeAgentId}-agent-output-error.json`,
          ),
          JSON.stringify(
            { output: judgeResult.output, trace: agentOutput },
            null,
            2,
          ),
        )
      }
      return null
    }

    return judgeResult.output.value as JudgingResult
  } catch (error) {
    console.warn(`Judge ${judgeAgentId} failed:`, error)
    return null
  }
}

export async function judgeCommitResult(
  input: JudgeCommitResultInput,
): Promise<JudgingResult> {
  const {
    commit,
    contextFiles,
    agentDiff,
    error,
    finalCheckOutputs,
    finalCheckOutputsStructured,
  } = input

  const { prompt, spec, fileDiffs } = commit

  const groundTruthDiffs = fileDiffs
    .map(({ path, diff }) => {
      return `### ${path}\n\`\`\`diff\n${diff}\n\`\`\``
    })
    .join('\n\n')

  const contextFilesContent = Object.entries(contextFiles)
    .map(([filePath, content]) => {
      return `### ${filePath}\n\`\`\`\n${content}\n\`\`\``
    })
    .join('\n\n')

  const judgePrompt = `## User Prompt (What the agent was asked to do)
${prompt}

## Task Specification (Expected observable outcome)
${spec || '(No task specification)'}

## Context Files (from parent commit)
${contextFilesContent || '(No context files)'}

## Ground Truth Changes (One valid implementation)
${groundTruthDiffs}

## Agent's Changes (What the agent actually did)
\`\`\`diff
${agentDiff || '(No changes made)'}
\`\`\`
${error ? `\n## Error Encountered\n${error}` : ''}
${finalCheckOutputs ? `\n## Final Check Command Outputs\n${finalCheckOutputs}` : ''}`

  // Run 2 judges in parallel
  const judgePromises = [
    runSingleJudge(input, judgePrompt, 'judge-gpt'),
    runSingleJudge(input, judgePrompt, 'judge-gemini'),
  ]

  const judgeResults = await Promise.all(judgePromises)
  const validResults = judgeResults.filter(
    (result): result is JudgingResult => result !== null,
  )

  if (validResults.length === 0) {
    console.error('All judges failed to provide results')
    return {
      analysis: 'Error running judge agent - all judges failed',
      strengths: [],
      weaknesses: ['All judges failed to provide structured output'],
      completionScore: 0,
      codeQualityScore: 0,
      overallScore: 0,
      // No judge produced structured output — these all-zero scores are
      // synthetic, NOT a measured 0/10. Signal this explicitly to downstream
      // consumers (FINAL_RESULTS.json, meta-analysis) so they can exclude the
      // run from averages instead of treating it as a true zero.
      scoringStatus: 'all_judges_failed',
    }
  }

  // Some (but not all) judges failed to produce structured output. The scores
  // below are still derived from the judges that succeeded, but the run is
  // noisier than usual — surface that as a distinct signal.
  const scoringStatus: ScoringStatus =
    validResults.length < judgeResults.length
      ? 'partial_judge_failure'
      : 'scored'

  // Sort judges by overall score and select the median for analysis
  const sortedResults = validResults.sort(
    (a, b) => a.overallScore - b.overallScore,
  )
  const medianIndex = Math.floor(sortedResults.length / 2)
  const medianResult = sortedResults[medianIndex]

  // Calculate average scores across all valid judges
  const averageCompletionScore =
    validResults.reduce((sum, r) => sum + r.completionScore, 0) /
    validResults.length
  const averageCodeQualityScore =
    validResults.reduce((sum, r) => sum + r.codeQualityScore, 0) /
    validResults.length
  const averageOverallScore =
    validResults.reduce((sum, r) => sum + r.overallScore, 0) /
    validResults.length
  const idiomScoredResults = validResults.filter(
    (r): r is JudgingResult & { idiomScore: number } =>
      typeof r.idiomScore === 'number',
  )
  const averageIdiomScore =
    idiomScoredResults.length > 0
      ? idiomScoredResults.reduce((sum, r) => sum + r.idiomScore, 0) /
        idiomScoredResults.length
      : undefined
  const nonIdiomaticPatternsDetected = Array.from(
    new Set(validResults.flatMap((r) => r.nonIdiomaticPatternsDetected ?? [])),
  )

  console.log(
    `Judging results overall score: ${averageOverallScore.toFixed(1)} (individual scores: ${validResults.map((r) => r.overallScore.toFixed(1)).join(', ')})`,
  )

  // Return median judge's analysis with averaged scores
  const averagedResult: JudgingResult = {
    analysis: medianResult.analysis,
    strengths: medianResult.strengths,
    weaknesses: medianResult.weaknesses,
    completionScore: averageCompletionScore,
    codeQualityScore: averageCodeQualityScore,
    overallScore: averageOverallScore,
    idiomScore: averageIdiomScore,
    nonIdiomaticPatternsDetected:
      nonIdiomaticPatternsDetected.length > 0
        ? nonIdiomaticPatternsDetected
        : undefined,
    // 'scored' when all judges succeeded; 'partial_judge_failure' when some
    // dropped out (see the computation above). clampScoresByDeterministicSignals
    // preserves this field unchanged via object spread.
    scoringStatus,
  }

  // P2-1: Apply deterministic clamping from finalCheckCommands exit codes.
  // This caps scores when compile/test/lint signals are definitively broken,
  // reducing LLM judge variance (a compile failure should never yield 7/10).
  const signals = computeDeterministicSignals(finalCheckOutputsStructured)
  const clampedResult = clampScoresByDeterministicSignals(
    averagedResult,
    signals,
  )
  if (clampedResult !== averagedResult && !signals.isEmpty) {
    console.log(
      `Deterministic clamp applied: overall ${averageOverallScore.toFixed(1)} → ${clampedResult.overallScore.toFixed(1)} (signals: compiles=${signals.compiles}, testsPass=${signals.testsPass}, lintPass=${signals.lintPass}, fails=${signals.failCount}/${signals.commandCount})`,
    )
  }

  return clampedResult
}
