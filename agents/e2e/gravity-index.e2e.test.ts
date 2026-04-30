import fs from 'fs'
import os from 'os'
import path from 'path'

import { API_KEY_ENV_VAR } from '@codebuff/common/constants/paths'
import { CodebuffClient, type AgentDefinition } from '@codebuff/sdk'
import { describe, expect, it } from 'bun:test'

import base2Free from '../base2/base2-free'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

describe('Gravity Index SDK E2E', () => {
  it(
    'test agent uses gravity_index for third-party service selection',
    async () => {
      const apiKey = process.env[API_KEY_ENV_VAR]
      if (!apiKey) {
        console.warn(
          `Skipping Gravity Index E2E: set ${API_KEY_ENV_VAR} to run.`,
        )
        return
      }

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'gravity-index-e2e-'),
      )
      const events: PrintModeEvent[] = []
      const gravityIndexTestAgent = {
        ...(base2Free as AgentDefinition),
        id: 'base2-free-gravity-index-e2e',
        displayName: 'Base2 Free Gravity Index E2E',
        toolNames: [
          ...((base2Free as AgentDefinition).toolNames ?? []),
          'gravity_index',
        ],
        systemPrompt: `${(base2Free as AgentDefinition).systemPrompt}

For this E2E test, use the gravity_index tool when asked to recommend third-party developer services.`,
      } satisfies AgentDefinition

      try {
        const client = new CodebuffClient({
          apiKey,
          cwd: tmpDir,
          projectFiles: {
            'package.json': JSON.stringify({
              scripts: {},
              dependencies: { next: '^15.0.0' },
            }),
          },
          agentDefinitions: [gravityIndexTestAgent],
          handleEvent: (event) => {
            events.push(event)
          },
        })

        const run = await client.run({
          agent: gravityIndexTestAgent.id,
          prompt:
            'Use the Gravity Index to recommend a transactional email API for a Next.js app. Include the tracked API-key signup URL from the tool result.',
          maxAgentSteps: 4,
        })

        if (run.output.type === 'error') {
          throw new Error(run.output.message)
        }

        const toolCalls = events.filter((event) => event.type === 'tool_call')
        expect(
          toolCalls.some(
            (event) =>
              'toolName' in event && event.toolName === 'gravity_index',
          ),
        ).toBe(true)

        const outputText = events
          .filter((event) => event.type === 'text')
          .map((event) => ('text' in event ? event.text : ''))
          .join('')
        expect(outputText).toMatch(/https:\/\/index\.trygravity\.ai\/go\//)
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true })
      }
    },
    { timeout: 300_000 },
  )
})
