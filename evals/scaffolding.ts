import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { getFileTokenScores } from '@codebuff/code-map/parse'
import { getSystemInfo } from '@codebuff/common/util/system-info'

import {
  getAllFilePaths,
  getProjectFileTree,
} from '../common/src/project-file-tree'

import type { ProjectFileContext } from '@codebuff/common/util/file'

let projectRootForMocks: string | undefined

function readMockFile(projectRoot: string, filePath: string): string | null {
  const fullPath = path.join(projectRoot, filePath)
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (error) {
    return null
  }
}

export function createFileReadingMock(projectRoot: string) {
  projectRootForMocks = projectRoot
}

export async function getProjectFileContext(
  projectPath: string,
): Promise<ProjectFileContext> {
  projectRootForMocks = projectPath
  const fileTree = await getProjectFileTree({
    projectRoot: projectPath,
    fs: fs.promises,
  })
  const allFilePaths = getAllFilePaths(fileTree)
  const knowledgeFilePaths = allFilePaths.filter((filePath) =>
    filePath.endsWith('knowledge.md'),
  )
  const knowledgeFiles: Record<string, string> = {}
  for (const filePath of knowledgeFilePaths) {
    const content = readMockFile(projectPath, filePath)
    if (content !== null) {
      knowledgeFiles[filePath] = content
    }
  }
  const fileTokenScoresResponse = await getFileTokenScores(
    projectPath,
    allFilePaths,
  )
  const fileTokenScores = fileTokenScoresResponse.tokenScores
  return {
    projectRoot: projectPath,
    cwd: projectPath,
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    systemInfo: getSystemInfo(),
    shellConfigFiles: {},
    knowledgeFiles,
    fileTokenScores,
    fileTree,
    agentTemplates: {},
    customToolDefinitions: {},
  }
}

export function resetRepoToCommit(projectPath: string, commit: string) {
  console.log(`Resetting repository at ${projectPath} to commit ${commit}...`)
  try {
    execSync(
      `cd ${projectPath} && git reset --hard ${commit} && git clean -fd`,
      {
        timeout: 30_000,
      },
    )
    console.log('Repository reset successful')
  } catch (error) {
    console.error('Error resetting repository:', error)
    throw error
  }
}
