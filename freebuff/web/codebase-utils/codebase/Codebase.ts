import type { PackageManager } from "../packageManager";
import { ExtendedGitOperations } from "./ExtendedGitOperations";

export type EnvVars = {
  frontend: Record<string, string>;
  backend: Record<string, string>;
};

export type Commit = {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
};
export interface VersionControlledCodebase {
  commit(message: string, allowEmpty?: boolean): Promise<Commit>;
  getCommits(): Promise<Commit[]>;
  revertToCommit(commitHash: string): Promise<string>;
}

export interface EnvironmentVariableCodebase {
  getEnvVars(): Promise<EnvVars>;
  setEnvVars(envVars: EnvVars): Promise<void>;
}

export type VercelDeploymentFile = {
  file: string;
  sha: string;
  size: number;
  content: Buffer;
};

export interface VercelDeployableCodebase {
  prepareForDeployment(rootDir?: string): Promise<VercelDeploymentFile[]>;
}

export interface DevServerCodebase {
  restartDevServer(): Promise<void>;
  stopDevServer(): Promise<void>;
}

export interface PackageManagerCodebase {
  getLockfileName(): string;
  getPackageManagerName(): "pnpm" | "bun";
  getPackageManager(): PackageManager;
}

export type ProcessInfo = {
  pid: number;
  cpu_percent: number;
  mem_percent: number;
  mem_kb?: number;
  command: string;
};

export type SandboxStats = {
  timestamp: string;
  cpu: {
    limit_cores: number;
    usage_percent: number;
    top_processes: ProcessInfo[];
  };
  memory: {
    limit_bytes: number;
    used_bytes: number;
    usage_percent: number;
    top_processes: ProcessInfo[];
  };
  disk: {
    filesystem: string;
    size_bytes: number;
    used_bytes: number;
    available_bytes: number;
    usage_percent: number;
    mount_point: string;
  };
  system_load: {
    "1min": number;
    "5min": number;
    "15min": number;
  };
  uptime_seconds: number;
};

export interface SandboxStatsCodebase {
  getStats(): Promise<SandboxStats>;
}

export interface Codebase {
  initialize(): Promise<void>;
  downloadCodebase(): Promise<string>;
  runCommand(
    command: string,
    timeout?: number,
    onStreamChunk?: (chunk: string) => void,
  ): Promise<{ output: string; exitCode?: number | undefined }>;
  runCommandThrow(
    command: string,
    timeout?: number,
    onStreamChunk?: (chunk: string) => void,
  ): Promise<{ output: string; exitCode?: number | undefined }>;
  readFile(filePath: string): Promise<string>;
  readFileBytes(filePath: string): Promise<Uint8Array>;
  writeFile(filePath: string, content: string): Promise<void>;
  writeBinaryFile(filePath: string, content: Uint8Array): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  createDirectory(dirPath: string): Promise<void>;
  checkIfFileExists(filePath: string): Promise<boolean>;
  getAllFilePaths(forceRefresh?: boolean): Promise<string[]>;
  refreshFilePaths(): Promise<string[]>;
  getPreviewUrl(): Promise<string>;
  installDependencies(): Promise<void>;
}

// Type guards for checking interface implementations
export function isVersionControlled(
  codebase: Codebase,
): codebase is Codebase & VersionControlledCodebase {
  return (
    "commit" in codebase &&
    "getCommits" in codebase &&
    "revertToCommit" in codebase
  );
}

export function hasExtendedGitOperations(
  codebase: Codebase,
): codebase is Codebase & ExtendedGitOperations {
  return (
    "getCurrentBranch" in codebase &&
    "createBranch" in codebase &&
    "checkoutBranch" in codebase &&
    "getStatus" in codebase &&
    "getDiff" in codebase &&
    "fetch" in codebase &&
    "push" in codebase &&
    "pull" in codebase &&
    "addFiles" in codebase
  );
}

export function hasEnvironmentVariables(
  codebase: Codebase,
): codebase is Codebase & EnvironmentVariableCodebase {
  return "getEnvVars" in codebase && "setEnvVars" in codebase;
}

export function isVercelDeployable(
  codebase: Codebase,
): codebase is Codebase & VercelDeployableCodebase {
  return "prepareForDeployment" in codebase;
}

export function hasDevServer(
  codebase: Codebase,
): codebase is Codebase & DevServerCodebase {
  return "restartDevServer" in codebase;
}

export function hasSandboxStats(
  codebase: Codebase,
): codebase is Codebase & SandboxStatsCodebase {
  return "getStats" in codebase;
}

export function hasPackageManager(
  codebase: Codebase,
): codebase is Codebase & PackageManagerCodebase {
  return "getLockfileName" in codebase;
}
