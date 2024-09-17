import { expect, describe, it, mock } from 'bun:test'
import { WebSocket } from 'ws'

import { generateKnowledgeFiles } from 'backend/generate-knowledge-files'
import {
  messages as cacheExpirationMessages,
  mockFileContext as cacheExpirationFileContext,
  expectedFiles as cacheExpirationExpectedFiles,
} from '../__mock-data__/knowledge-files/cache-expiration'
import {
  mockFileContext as crawleeFileContext,
  messages as crawleeMessages,
  expectedFiles as crawleeExpectedFiles,
} from '../__mock-data__/knowledge-files/crawlee'
import { ProjectFileContext } from 'common/util/file'
import { FileChange, Message } from 'common/actions'

const CLAUDE_CALL_TIMEOUT = 1000 * 150
const mockWs = {
  send: mock(),
} as unknown as WebSocket

const runGenKnowledgeFilesTest = async (
  fileContext: ProjectFileContext,
  messages: Message[],
  expectedFiles: FileChange[]
) => {
  const responses = await generateKnowledgeFiles(
    'userId',
    mockWs,
    '',
    fileContext,
    messages
  )
  if (expectedFiles.length > 0) {
    expect(responses.length).toBeGreaterThanOrEqual(expectedFiles.length)
  } else {
    expect(responses.length).toBe(0)
  }
}

describe('generateKnowledgeFiles', () => {
  it(
    'should not generate knowledge files for a cache expiration change',
    async () => {
      await runGenKnowledgeFilesTest(
        cacheExpirationFileContext,
        cacheExpirationMessages,
        cacheExpirationExpectedFiles
      )
    },
    CLAUDE_CALL_TIMEOUT
  )

  it(
    'should generate a knowledge file for web scraping library change',
    async () => {
      await runGenKnowledgeFilesTest(
        crawleeFileContext,
        crawleeMessages,
        crawleeExpectedFiles
      )
    },
    CLAUDE_CALL_TIMEOUT
  )
})
