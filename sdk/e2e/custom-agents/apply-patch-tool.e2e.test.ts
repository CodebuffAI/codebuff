import fs from 'fs'
import os from 'os'
import path from 'path'

import { beforeAll, describe, expect, test } from 'bun:test'

import { CodebuffClient } from '../../src'
import {
  DEFAULT_TIMEOUT,
  EventCollector,
  getApiKey,
  skipIfNoApiKey,
} from '../utils'

import type { AgentDefinition } from '../../src'

describe('Custom Agents: apply_patch tool', () => {
  let client: CodebuffClient

  const patchAgent: AgentDefinition = {
    id: 'apply-patch-agent',
    displayName: 'Apply Patch Agent',
    model: 'openai/gpt-5.3-codex',
    toolNames: ['apply_patch'],
    instructionsPrompt: 'Use apply_patch for file edits.',
  }

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'applies a codex-style patch through the native tool',
    async () => {
      if (skipIfNoApiKey()) return

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'codebuff-apply-patch-'),
      )
      const collector = new EventCollector()

      await client.run({
        agent: patchAgent.id,
        prompt: 'Apply patch to create a file',
        agentDefinitions: [patchAgent],
        handleEvent: collector.handleEvent,
        cwd: tmpDir,
      })

      const createdFile = path.join(tmpDir, 'hello-from-apply-patch.txt')
      const content = await fs.promises.readFile(createdFile, 'utf-8')
      expect(content).toContain('hello from apply_patch')

      const toolCalls = collector.getEventsByType('tool_call')
      expect(toolCalls.some((call) => call.toolName === 'apply_patch')).toBe(
        true,
      )
    },
    DEFAULT_TIMEOUT,
  )
})
