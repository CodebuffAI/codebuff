import { Model } from '@codebuff/common/constants'
import { z } from 'zod'
import { AgentStep } from '../scaffolding'
import { PostEvalAnalysis } from './post-eval-analysis'

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

export interface CommitFileState {
  path: string
  preContent: string // Content before the commit
  postContent: string // Content after the commit
}

export interface EvalCommit extends CommitInfo {
  spec: string
  selectionReason: string // Why Sonnet chose this commit
  fileStates: CommitFileState[] // Ground truth file states
}

export interface GitRepoEvalData {
  repoUrl: string // URL of the git repository to clone
  testRepoName?: string // Optional - can be inferred from repoUrl
  generationDate: string
  evalCommits: EvalCommit[]
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
  fileStates: CommitFileState[] // Files Codebuff changed
  durationMs: number
}

export interface EvalRunJudged extends EvalRunLog {
  judging_results: z.infer<typeof JudgingAnalysisSchema>
}

export interface FullEvalLog {
  test_repo_name: string
  generation_date: string
  eval_runs: EvalRunJudged[]
  overall_metrics: {
    average_completion: number
    average_efficiency: number
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

// Types for run-eval-set
export interface ModelConfig {
  reasoningModel?: Model
  agentModel?: Model
}

export interface EvalConfig {
  name: string
  evalDataPath: string
  outputDir: string
  modelConfig: ModelConfig
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
