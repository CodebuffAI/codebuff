import path from 'path'
import * as fs from 'fs'
import type { FileVersion, ProjectFileContext } from '../../../common/src/util/file'
import { execSync } from 'child_process'

export function getProjectRoot(): string {
  try {
    // Try to find git root
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    return gitRoot
  } catch (e) {
    // If not in a git repo, use current directory
    return process.cwd()
  }
}

export function getFiles(filePaths: string[]): Record<string, string | null> {
  const files: Record<string, string | null> = {}
  for (const filePath of filePaths) {
    try {
      files[filePath] = fs.readFileSync(filePath, 'utf8')
    } catch (e) {
      files[filePath] = null
    }
  }
  return files
}

export async function getProjectFileContext(
  projectRoot: string,
  currentFileVersion: Record<string, string>,
  fileVersions: FileVersion[][]
): Promise<ProjectFileContext> {
  const gitStatus = execSync('git status --porcelain', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim()

  const gitDiff = execSync('git diff', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim()

  const gitDiffCached = execSync('git diff --cached', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim()

  const lastCommitMessages = execSync('git log -3 --pretty=format:%s', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim()

  return {
    currentWorkingDirectory: projectRoot,
    fileTree: [], // We'll implement this later if needed
    fileTokenScores: {},
    knowledgeFiles: currentFileVersion,
    gitChanges: {
      status: gitStatus,
      diff: gitDiff,
      diffCached: gitDiffCached,
      lastCommitMessages,
    },
    changesSinceLastChat: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: process.platform,
      shell: process.env.SHELL || '',
      nodeVersion: process.version,
      arch: process.arch,
      homedir: process.env.HOME || '',
      cpus: require('os').cpus().length,
    },
    fileVersions,
  }
}
