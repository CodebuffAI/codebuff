import type { CodebuffClient } from '../../sdk/src/client'

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

export interface EvalRun {
  commitSha: string
  spec: string
  diff: string
  judgeScore: number
  judgeFeedback: string
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
    }
  | {
      type: 'agent_complete'
      agent: string
      commit: string
      score: number
    }
  | {
      type: 'agent_error'
      agent: string
      commit: string
      error: string
    }

export interface GitEvals2Options {
  evalDataPath: string
  agents: string[]
  outputPath?: string
  limit?: number
  onProgress?: (event: ProgressEvent) => void
  client?: CodebuffClient
}

export interface GitEvals2Result {
  agents: Map<string, AgentEvalResults>
  timestamp: string
  totalDuration: number
}
