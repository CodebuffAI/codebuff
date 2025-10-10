import { z } from 'zod/v4'

import type { AgentStep } from '../scaffolding'
import type { PostEvalAnalysis } from './post-eval-analysis'
import type { Model } from '@codebuff/common/old-constants'

export interface FileState {
  path: string
  preContent: string // Content before the commit
  postContent: string // Content after the commit
}

export interface EvalCommit {
  sha: string
  parentSha: string // The commit right before the target commit -- what the coding agent checks out.
  spec: string
  fileStates: FileState[] // Ground truth file states
}

export interface EvalData {
  repoUrl: string // URL of the git repository to clone
  testRepoName?: string // Optional - can be inferred from repoUrl
  generationDate: string
  initCommand?: string // Optional command to run during scaffolding setup
  evalCommits: EvalCommit[]
}

// Input structure for creating evaluations (from gen-evals)
export interface EvalInput {
  commitSha: string // Required - defines the codebase state to load for the task
  parentSha?: string // Optional - if not provided, will compute from commit parent
  fileStates?: FileState[] // Optional - if not provided, will compute from commit parent
}

// Agent interaction types
export type AgentDecision = 'continue' | 'complete' | 'halt'

export interface CodebuffTrace {
  prompt: string
  steps: AgentStep[]
}

// Evaluation run types
export interface EvalRunLog {
  eval_commit: EvalCommit
  trace: CodebuffTrace[]
  error?: string
  gitDiff: string
  durationMs: number
  costUsd: number
}

export interface EvalRunJudged extends EvalRunLog {
  judging_results: z.infer<typeof JudgingAnalysisSchema>
  computed_metrics: {
    runtime_sec: number
    cost_usd: number
  }
}

export interface FullEvalLog {
  test_repo_name: string
  generation_date: string
  eval_runs: EvalRunJudged[]
  overall_metrics: {
    average_runtime_sec: number
    average_cost_usd: number
    average_completion: number
    average_code_quality: number
    average_overall: number
    average_duration_ms: number
    total_runs: number
    successful_runs: number
    failed_runs: number
  }
}
// Zod schemas
export const AgentDecisionSchema = z.object({
  decision: z.enum(['continue', 'complete', 'halt']),
  reasoning: z.string(),
  next_prompt: z.string(),
})

export const CommitSelectionSchema = z.object({
  commits: z.array(
    z.object({
      sha: z.string(),
      reason: z.string(),
    }),
  ),
})

export const JudgingAnalysisSchema = z.object({
  analysis: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  metrics: z.object({
    completionScore: z.number().min(0).max(10),
    codeQualityScore: z.number().min(0).max(10),
    overallScore: z.number().min(0).max(10),
  }),
})

// Types for run-eval-set
export interface ModelConfig {
  reasoningModel?: Model
  agentModel?: Model
}

export interface EvalConfig {
  name: string
  evalDataPath: string
  outputDir: string
  limit?: number
}

export interface EvalResult {
  name: string
  status: 'success' | 'error'
  result?: FullEvalLog
  analysis?: PostEvalAnalysis
  error?: string
  duration: number
}
