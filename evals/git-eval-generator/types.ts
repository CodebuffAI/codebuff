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
  repoPath: string
  generationDate: string
  evalCommits: EvalCommit[]
}
