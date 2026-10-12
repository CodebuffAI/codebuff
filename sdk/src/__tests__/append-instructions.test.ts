import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CodebuffClient } from '../client'
import { createBase3 } from '../../../agents/base3'
import { APPEND_INSTRUCTIONS_KEY, AppendInstructionsError } from '@codebuff/common/append-instructions'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

const originalFetch = globalThis.fetch
const dirs: string[] = []
afterEach(async () => { globalThis.fetch = originalFetch; for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })

// Native bundled system prompt, not a test-only knowledge placeholder.
const agent = { ...createBase3(), id: 'snapshot-native-root', toolNames: [], spawnableAgents: [] } as AgentDefinition
const byok = {
  id: 'snapshot', revision: 1, name: 'test', provider: 'openai-compatible' as const,
  baseUrl: 'http://127.0.0.1:9876/v1', model: 'scripted/model', apiKey: 'test-only',
  credentialRef: 'connection:snapshot:1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

test('constructor snapshot reaches native provider prompt; persists across turns and compact without replacing rules', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'freebuff-snapshot-')); dirs.push(cwd)
  await writeFile(join(cwd, 'AGENTS.md'), 'PROJECT_RULE_CANARY')
  const requests: any[] = []
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)); requests.push(body)
    return new Response(`data: ${JSON.stringify({ id: 'done', object: 'chat.completion.chunk', created: 1, model: body.model,
      choices: [{ index: 0, delta: { content: 'Complete.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch
  const snapshot = 'HOST_RULE_CANARY 你好'
  const client = new CodebuffClient({ cwd, byok, appendInstructions: snapshot, agentDefinitions: [agent] })
  const first = await client.run({ agent: agent.id, prompt: '-Create hello.txt.' })
  expect(first.output.type).not.toBe('error')
  const system = JSON.stringify(requests[0].messages.filter((m: any) => m.role === 'system'))
  expect(system).toContain('You are Buffy')
  expect(system).toContain('PROJECT_RULE_CANARY')
  expect(system).toContain(snapshot)
  const user = JSON.stringify(requests[0].messages.filter((m: any) => m.role === 'user'))
  expect(user).toContain('-Create hello.txt.')
  expect(user).not.toContain(snapshot)
  expect(first.sessionState!.fileContext.userKnowledgeFiles![APPEND_INSTRUCTIONS_KEY]).toBe(snapshot)
  // Preserve native home-map data without changing real developer home files.
  first.sessionState!.fileContext.userKnowledgeFiles!['~/.AGENTS.md'] = 'USER_RULE_CANARY'
  const saved = JSON.parse(JSON.stringify(first))
  const plainClient = new CodebuffClient({ cwd, byok, agentDefinitions: [agent] })
  const second = await plainClient.run({ agent: agent.id, prompt: 'Continue.', previousRun: saved })
  expect(second.output.type).not.toBe('error')
  const secondSystem = JSON.stringify(requests.at(-1).messages.filter((m: any) => m.role === 'system'))
  expect(secondSystem).toContain('USER_RULE_CANARY')
  expect(secondSystem.split(snapshot)).toHaveLength(2)
  const compacted = await client.run({ agent: agent.id, prompt: '/compact', previousRun: second })
  expect(compacted.output.type).not.toBe('error')
  expect(compacted.sessionState!.fileContext.userKnowledgeFiles![APPEND_INSTRUCTIONS_KEY]).toBe(snapshot)
  const before = requests.length
  for (const input of ['changed', '', '\0', 'a'.repeat(65537), '\ud800', null, 42]) {
    await expect(plainClient.run({ agent: agent.id, prompt: 'Continue.', previousRun: compacted, appendInstructions: input as string })).rejects.toBeInstanceOf(AppendInstructionsError)
  }
  expect(requests).toHaveLength(before)
  const legacy = JSON.parse(JSON.stringify(first)); delete legacy.sessionState.fileContext.userKnowledgeFiles
  await expect(client.run({ agent: agent.id, prompt: 'Retrofit.', previousRun: legacy })).rejects.toThrow('start a new conversation')
  const defaultRun = await plainClient.run({ agent: agent.id, prompt: 'Legacy.', previousRun: legacy })
  expect(defaultRun.output.type).not.toBe('error')
  expect(defaultRun.sessionState!.fileContext.userKnowledgeFiles?.[APPEND_INSTRUCTIONS_KEY]).toBeUndefined()
})
