import { z } from 'zod'

// Base commit types
export interface CommitInfo {
  sha: string
  author: string
  date: string
  message: string
  stats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
}

export interface EvalCommit extends CommitInfo {
  spec: string
  selectionReason: string // Why Sonnet chose this commit
}

export interface GitRepoEvalData {
  testRepoName: string
  generationDate: string
  evalCommits: EvalCommit[]
}

// Agent interaction types
export type AgentDecision = 'continue' | 'complete' | 'halt'

export interface AgentInteraction {
  prompt: string
  codebuff_input: string
  codebuff_output: string
  agent_decision: AgentDecision
  agent_reasoning: string
}

// Evaluation run types
export interface EvalRunLog {
  eval_commit: EvalCommit
  interactions: AgentInteraction[]
  final_status: AgentDecision
  error?: string
  judging_results?: z.infer<typeof JudgingAnalysisSchema>
}

export interface FullEvalLog {
  test_repo_name: string
  generation_date: string
  eval_runs: EvalRunLog[]
  overall_metrics: {
    average_completion: number
    average_efficiency: number
    average_code_quality: number
    average_overall: number
    total_runs: number
    successful_runs: number
    failed_runs: number
  }
}

// Zod schemas
export const AgentDecisionSchema = z.object({
  decision: z.enum(['continue', 'complete', 'halt']),
  reasoning: z.string(),
  next_prompt: z.string().optional(),
})

export const CommitSelectionSchema = z.object({
  commits: z.array(
    z.object({
      sha: z.string(),
      reason: z.string(),
    })
  ),
})

export const JudgingAnalysisSchema = z.object({
  analysis: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  metrics: z.object({
    completionScore: z.number().min(0).max(10),
    efficiencyScore: z.number().min(0).max(10),
    codeQualityScore: z.number().min(0).max(10),
    overallScore: z.number().min(0).max(10),
  }),
})
