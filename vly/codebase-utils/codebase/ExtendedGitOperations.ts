export interface BackupInfo {
  branchName: string;
  timestamp: string;
  commitHash?: string;
  originalBranch: string;
  hasUncommittedWork: boolean;
  githubBackupRef?: string;
}

export interface ExtendedGitOperations {
  // Branch operations
  getCurrentBranch(): Promise<string>;
  createBranch(branchName: string, fromRef?: string): Promise<void>;
  checkoutBranch(branchName: string): Promise<void>;
  deleteBranch(branchName: string, force?: boolean): Promise<void>;
  listBranches(): Promise<string[]>;

  // Status and diff operations
  getStatus(): Promise<{
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }>;
  getDiff(cached?: boolean, nameOnly?: boolean): Promise<string>;

  // Remote operations
  fetch(
    remote?: string,
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void>;
  pull(
    remote?: string,
    branch?: string,
    token?: string,
    repoOwner?: string,
    repoName?: string,
    noRebase?: boolean,
  ): Promise<void>;
  push(
    remote?: string,
    branch?: string,
    force?: boolean,
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void>;

  // Staging operations
  addFiles(files: string[]): Promise<void>;
  addAll(): Promise<void>;
  resetFiles(files: string[]): Promise<void>;

  // Additional operations
  getRemotes(): Promise<string[]>;
  addRemote(name: string, url: string): Promise<void>;
  removeRemote(name: string): Promise<void>;

  // Commit operations
  getCommitHash(ref?: string): Promise<string>;
  getCommitCount(ref?: string): Promise<number>;
  getCurrentCommitHash(): Promise<string>;

  // Remote state operations
  getRemoteHead(remote: string, branch: string): Promise<string | null>;
  getAheadBehindCounts(
    remote: string,
    branch: string,
  ): Promise<{ ahead: number; behind: number }>;

  // Reset operations
  resetHard(ref: string): Promise<void>;

  // Remote URL management
  setRemoteUrl(
    name: string,
    url: string,
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void>;
  getRemoteUrl(name: string): Promise<string>;

  // Branch tracking
  setUpstreamBranch(
    remote: string,
    remoteBranch: string,
    localBranch?: string,
  ): Promise<void>;

  // Repository initialization
  initRepository(): Promise<void>;
  configureUser(name: string, email: string): Promise<void>;

  // Tag operations
  createTag(tagName: string, message?: string, ref?: string): Promise<void>;
  pushTag(
    remote: string,
    tagName: string,
    token?: string,
    repoOwner?: string,
    repoName?: string,
  ): Promise<void>;
  listTags(): Promise<string[]>;
  deleteTag(tagName: string): Promise<void>;

  // Backup operations
  createBackupBranch(operation?: string): Promise<BackupInfo>;
  restoreFromBackup(backupInfo: BackupInfo): Promise<void>;
  cleanupOldBackups(keepCount?: number): Promise<void>;
  listBackupBranches(): Promise<
    Array<{
      branchName: string;
      commitHash: string;
      commitDate: string;
      commitMessage: string;
    }>
  >;
  verifyBackup(
    backupInfo: BackupInfo,
  ): Promise<{ isValid: boolean; error?: string }>;

  // Conflict detection and validation
  detectPotentialConflicts(
    token: string,
    repoOwner: string,
    repoName: string,
    remote?: string,
  ): Promise<{ hasConflicts: boolean; errorMessage?: string }>;
  commitIfDirty(): Promise<void>;

  // Conflict cleanup operations
  abortMerge(): Promise<void>;
  cleanupConflictedState(): Promise<void>;
}
