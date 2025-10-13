import type { JudgingResult } from './judge'

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
}

export interface EvalDataV2 {
  repoUrl: string
  testRepoName?: string
  generationDate: string
  initCommand?: string
  evalCommits: EvalCommitV2[]
}

export interface EvalRun {
  commitSha: string
  prompt: string
  diff: string
  judging: JudgingResult
  cost: number
  durationMs: number
  error?: string
}

export interface AgentEvalResults {
  agentId: string
  runs: EvalRun[]
  averageScore: number
  averageCost: number
  averageDuration: number
}

export type ProgressEvent =
  | {
      type: 'agent_start'
      agent: string
      commit: string
      evalId: string
    }
  | {
      type: 'agent_complete'
      agent: string
      commit: string
      evalId: string
      score: number
    }
  | {
      type: 'agent_error'
      agent: string
      commit: string
      evalId: string
      error: string
    }
