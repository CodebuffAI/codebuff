import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { getFileTokenScores } from '@codebuff/code-map/parse'
import { handleToolCall } from '@codebuff/npm-app/tool-handlers'
import { getSystemInfo } from '@codebuff/npm-app/utils/system-info'

import {
  getAllFilePaths,
  getProjectFileTree,
} from '../common/src/project-file-tree'

import type {
  SDKAssistantMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-code'
import type { ClientToolCall } from '@codebuff/common/tools/list'
import type { ToolResult } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export type ToolResultBlockParam = Extract<
  SDKUserMessage['message']['content'][number],
  { type: 'tool_result' }
>
export type ToolUseBlock = Extract<
  SDKAssistantMessage['message']['content'][number],
  { type: 'tool_use' }
>

export type AgentStep = {
  response: string
  toolCalls: (ClientToolCall | ToolUseBlock)[]
  toolResults: (ToolResult | ToolResultBlockParam)[]
}

function readMockFile(projectRoot: string, filePath: string): string | null {
  const fullPath = path.join(projectRoot, filePath)
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (error) {
    return null
  }
}

export async function getProjectFileContext(
  projectPath: string,
): Promise<ProjectFileContext> {
  const fileTree = getProjectFileTree(projectPath)
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
  const fileTokenScores = (await getFileTokenScores(projectPath, allFilePaths))
    .tokenScores
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

async function runToolCalls(toolCalls: ClientToolCall[]) {
  const toolResults: ToolResult[] = []
  for (const toolCall of toolCalls) {
    const toolResult = await handleToolCall(toolCall)
    toolResults.push(toolResult)
  }
  return toolResults
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

export default {
  getProjectFileContext,
  runToolCalls,
  resetRepoToCommit,
}
