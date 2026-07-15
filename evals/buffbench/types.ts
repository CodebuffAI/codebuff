import type { JudgingResult, ScoringStatus } from './judge'
import type { IdiomTraceabilityEvaluation } from './idiom-traceability-signals'
import type { ApplyProposalsResult, Proposal } from './proposals'

export interface FileState {
  path: string
  preContent: string
  postContent: string
}

export interface EvalCommit {
  sha: string
  parentSha: string
  spec: string
  fileStates: FileState[]
}

export interface EvalData {
  repoUrl: string
  testRepoName?: string
  generationDate: string
  initCommand?: string
  evalCommits: EvalCommit[]
}

export interface FileDiff {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  oldPath?: string
  diff: string
}

export interface EvalCommitV2 {
  id: string
  sha: string
  parentSha: string
  spec: string
  prompt: string
  supplementalFiles: string[]
  fileDiffs: FileDiff[]
  languages?: string[]
  frameworks?: string[]
  taskType?: string
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert'
  finalCheckCommands?: FinalCheckCommand[]
}

export interface CapabilityMetricInput {
  model: string
  score: number
  language?: string
  taskType?: string
  agentRole?: string
}

export interface AggregatedCapabilityMetric extends CapabilityMetricInput {
  sampleSize: number
}

export function aggregateCapabilityMetrics(
  inputs: CapabilityMetricInput[],
): AggregatedCapabilityMetric[] {
  const groups = new Map<
    string,
    { template: CapabilityMetricInput; total: number; count: number }
  >()
  for (const input of inputs) {
    const key = JSON.stringify([
      input.model,
      input.language,
      input.taskType,
      input.agentRole,
    ])
    const current = groups.get(key) ?? { template: input, total: 0, count: 0 }
    current.total += input.score
    current.count += 1
    groups.set(key, current)
  }
  return [...groups.values()].map(({ template, total, count }) => ({
    ...template,
    score: total / count,
    sampleSize: count,
  }))
}

export interface BinInstall {
  name: string
  installScript: string
  binPath: string
}

export interface CacheRecallEvalConfig {
  /** Minimum cumulative prompt-cache hit ratio required for the eval run. */
  minCacheHitRatio?: number
  /** Substrings that must survive in final message history after compaction. */
  requiredRecallSubstrings?: string[]
  /** Fail the eval when no recall assertions were configured. */
  requireRecallAssertions?: boolean
}

export interface CacheRecallEvalResult {
  passed: boolean
  cachedInputTokens: number
  inputTokens: number
  cacheHitRatio?: number
  minCacheHitRatio?: number
  cacheHitRatioPassed: boolean
  requiredRecallSubstrings: string[]
  missingRecallSubstrings: string[]
  recallEvaluated: boolean
  recallPassed: boolean
  failureReason?: string
}

export interface EvalDataV2 {
  repoUrl: string
  testRepoName?: string
  generationDate: string
  initCommand?: string
  binInstalls?: BinInstall[]
  env?: Record<string, string>
  finalCheckCommands?: FinalCheckCommand[]
  cacheRecallEval?: CacheRecallEvalConfig
  evalCommits: EvalCommitV2[]
}

export interface FinalCheckSpec {
  /** Stable identifier used by dependsOn. Generated from the array index when omitted. */
  id?: string
  command: string
  /** Checks without dependencies may run concurrently in the bounded worker pool. */
  dependsOn?: string[]
  /** Per-check wall-clock timeout. Omit to inherit the runner default. */
  timeoutMs?: number
}

/**
 * Legacy strings remain sequential for compatibility. Object-form checks opt
 * into dependency-aware scheduling; independent objects can run in parallel.
 */
export type FinalCheckCommand = string | FinalCheckSpec

export interface FinalCheckOutput {
  checkId?: string
  command: string
  dependsOn?: string[]
  exitCode: number
  outcome?:
    | 'passed'
    | 'failed'
    | 'cancelled'
    | 'timed_out'
    | 'skipped'
    | 'configuration_error'
  durationMs?: number
  stdout: string
  stderr: string
}

export interface ProposalDryRunReport {
  proposals: Proposal[]
  appliedCount: number
  skippedCount: number
  summary: string[]
  perProposal: ApplyProposalsResult['perProposal']
}

export interface EvalRun {
  commitSha: string
  prompt: string
  diff: string
  judging: JudgingResult
  /**
   * Top-level mirror of {@link JudgingResult.scoringStatus} for ergonomic
   * filtering in meta-analysis (so consumers don't have to reach into
   * `judging`). Defaults to `'scored'` when absent (back-compat with old trace
   * files that predate the field).
   */
  scoringStatus?: ScoringStatus
  cost: number
  durationMs: number
  error?: string
  finalCheckOutputs?: FinalCheckOutput[]
  cacheRecallEval?: CacheRecallEvalResult
  retrievalFlow?: import('./retrieval-flow-metrics').RetrievalFlowMetrics
  idiomTraceability?: IdiomTraceabilityEvaluation
  proposalDryRun?: ProposalDryRunReport
}

export interface AgentEvalResults {
  agentId: string
  runs: EvalRun[]
  averageScore: number
  averageScoreExcludingFailures: number
  averageIdiomScore?: number
  averageCost: number
  averageDuration: number
}
