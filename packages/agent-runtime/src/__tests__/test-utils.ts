import { generateCompactId } from '@codebuff/common/util/string'

import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type { ProjectFileContext } from '@codebuff/common/util/file'

/**
 * Creates a native tool call stream chunk for testing.
 * This replaces the old getToolCallString() approach which generated XML format.
 */
export function createToolCallChunk<T extends string>(
  toolName: T,
  input: Record<string, unknown>,
  toolCallId?: string,
): StreamChunk {
  return {
    type: 'tool-call',
    toolName,
    toolCallId: toolCallId ?? generateCompactId(),
    input,
  }
}

/**
 * Creates a mock stream that yields native tool call chunks.
 * Use this instead of streams that yield text with XML tool calls.
 */
export function createMockStreamWithToolCalls(
  chunks: (string | { toolName: string; input: Record<string, unknown> })[],
): AsyncGenerator<StreamChunk, string | null> {
  async function* generator(): AsyncGenerator<StreamChunk, string | null> {
    for (const chunk of chunks) {
      if (typeof chunk === 'string') {
        yield { type: 'text' as const, text: chunk }
      } else {
        yield createToolCallChunk(chunk.toolName, chunk.input)
      }
    }
    return 'mock-message-id'
  }
  return generator()
}

export const mockFileContext: ProjectFileContext = {
  projectRoot: '/test',
  cwd: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  userKnowledgeFiles: {},
  agentTemplates: {},
  customToolDefinitions: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
}
