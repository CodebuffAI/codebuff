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

For this E2E test, use the gravity_index tool when asked to recommend third-party developer services. After choosing one service, call render_ui exactly once with a gravity_index link reference containing its search_id and service_slug.`,
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
            'Use the Gravity Index to recommend a transactional email API for a Next.js app. Explain the choice and render one tracked signup button for the service you ultimately select.',
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

        const trackedUrls = events
          .filter(
            (event) =>
              event.type === 'tool_result' &&
              'toolName' in event &&
              event.toolName === 'gravity_index' &&
              'output' in event &&
              Array.isArray(event.output) &&
              event.output[0]?.type === 'json',
          )
          .flatMap((event) => {
            if (
              !('output' in event) ||
              !Array.isArray(event.output) ||
              event.output[0]?.type !== 'json' ||
              !event.output[0].value ||
              typeof event.output[0].value !== 'object' ||
              Array.isArray(event.output[0].value)
            ) {
              return []
            }
            const value = event.output[0].value
            const recommendation =
              value.recommendation &&
              typeof value.recommendation === 'object' &&
              !Array.isArray(value.recommendation)
                ? value.recommendation
                : undefined
            const options = Array.isArray(value.options) ? value.options : []
            const credentialRequest =
              value.credential_request &&
              typeof value.credential_request === 'object' &&
              !Array.isArray(value.credential_request)
                ? value.credential_request
                : undefined
            const serviceUrls = [recommendation, ...options].map((service) =>
              service &&
              typeof service === 'object' &&
              !Array.isArray(service) &&
              typeof service.click_url === 'string'
                ? service.click_url
                : undefined,
            )
            return [
              ...serviceUrls,
              typeof value.click_url === 'string' ? value.click_url : undefined,
              credentialRequest &&
              typeof credentialRequest.setup_url === 'string'
                ? credentialRequest.setup_url
                : undefined,
            ].filter((url): url is string => Boolean(url))
          })
        const renderUICalls = toolCalls.filter(
          (event) => 'toolName' in event && event.toolName === 'render_ui',
        )
        const renderUIResults = events.filter(
          (event) =>
            event.type === 'tool_result' &&
            'toolName' in event &&
            event.toolName === 'render_ui',
        )

        expect(renderUICalls).toHaveLength(1)
        const renderedLink =
          'input' in renderUICalls[0]
            ? renderUICalls[0].input?.widget?.link
            : undefined
        if (typeof renderedLink !== 'string') {
          throw new Error('render_ui did not receive a resolved button URL')
        }
        expect(trackedUrls).toContain(renderedLink)
        expect(renderUIResults).toHaveLength(1)
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true })
      }
    },
    { timeout: 300_000 },
  )
})
