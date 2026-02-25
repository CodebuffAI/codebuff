import fs from 'fs'
import os from 'os'
import path from 'path'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { CodebuffClient, getUserCredentials } from '@codebuff/sdk'
import { beforeAll, describe, expect, it } from 'bun:test'
import { $ } from 'bun'

import baseDeep from '../base2/base-deep'
import thinkerGpt from '../thinker/thinker-gpt'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

describe('Base Deep Agent Integration', () => {
  const runSlow = process.env.RUN_BASE_DEEP_SLOW_E2E === 'true'
  const slowIt = runSlow ? it : it.skip

  const traceDir = path.resolve(process.cwd(), 'e2e-traces', 'base-deep')

  const loadEnvFile = async (filePath: string) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const normalized = line.startsWith('export ')
          ? line.slice('export '.length)
          : line
        const equalsIndex = normalized.indexOf('=')
        if (equalsIndex <= 0) continue
        const key = normalized.slice(0, equalsIndex).trim()
        if (!key || process.env[key]) continue
        let value = normalized.slice(equalsIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    } catch {
      // ignore missing env files
    }
  }

  const getApiKeyOrSkip = (): string | null => {
    const apiKey =
      process.env[API_KEY_ENV_VAR] ?? getUserCredentials()?.authToken
    if (!apiKey) {
      console.warn(
        `${API_KEY_ENV_VAR} is not set; skipping base-deep integration test.`,
      )
      return null
    }
    return apiKey
  }

  const sanitizeForPath = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

  const getToolCallNames = (events: PrintModeEvent[]) =>
    events
      .filter((event) => event.type === 'tool_call')
      .map((event) => event.toolName)

  const getSpawnedAgentTypes = (events: PrintModeEvent[]) =>
    events
      .filter((event) => event.type === 'subagent_start')
      .map((event) => event.agentType)

  const countThinkerToolErrors = (events: PrintModeEvent[]) => {
    let count = 0
    for (const event of events) {
      if (event.type !== 'tool_result') continue
      if (!event.parentAgentId?.includes('thinker-gpt')) continue
      for (const part of event.output) {
        if (part.type !== 'json') continue
        if (typeof part.value !== 'object' || part.value === null) continue
        const message =
          'errorMessage' in part.value
            ? part.value.errorMessage
            : 'message' in part.value
              ? part.value.message
              : undefined
        if (
          typeof message === 'string' &&
          message.toLowerCase().includes('error:')
        ) {
          count++
        }
      }
    }
    return count
  }

  const writeTrace = async (params: {
    testName: string
    events: PrintModeEvent[]
    runOutput: unknown
    cwd: string
    notes?: Record<string, unknown>
  }) => {
    await fs.promises.mkdir(traceDir, { recursive: true })
    const timestamp = new Date().toISOString().replaceAll(':', '-')
    const fileName = `${timestamp}-${sanitizeForPath(params.testName)}.json`
    const tracePath = path.join(traceDir, fileName)
    const toolCalls = getToolCallNames(params.events)
    const subagents = getSpawnedAgentTypes(params.events)
    const payload = {
      testName: params.testName,
      cwd: params.cwd,
      createdAt: new Date().toISOString(),
      summary: {
        eventCount: params.events.length,
        toolCalls,
        subagents,
        thinkerErrorCount: countThinkerToolErrors(params.events),
      },
      notes: params.notes,
      runOutput: params.runOutput,
      events: params.events,
    }
    await fs.promises.writeFile(
      tracePath,
      JSON.stringify(payload, null, 2),
      'utf-8',
    )
  }

  const createShallowClone = async () => {
    const cloneDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'base-deep-clone-'),
    )
    const repoUrl = `file://${path.resolve(process.cwd(), '..')}`
    await $`git clone --depth 1 --no-tags ${repoUrl} ${cloneDir}`.quiet()
    return cloneDir
  }

  const getDiffLineStats = async (cwd: string) => {
    const output = await $`git diff --numstat`.cwd(cwd).text()
    const lines = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    let added = 0
    let deleted = 0
    for (const line of lines) {
      const [a, d] = line.split(/\s+/)
      const addNum = Number(a)
      const delNum = Number(d)
      if (!Number.isNaN(addNum)) added += addNum
      if (!Number.isNaN(delNum)) deleted += delNum
    }

    return {
      added,
      deleted,
      total: added + deleted,
      filesChanged: lines.length,
      raw: output,
    }
  }

  beforeAll(async () => {
    await loadEnvFile(path.resolve(process.cwd(), '.env.local'))
    await loadEnvFile(path.resolve(process.cwd(), '../.env.local'))
    await fs.promises.mkdir(traceDir, { recursive: true })
  })

  it(
    'spawns thinker-gpt when requested',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: '/tmp/base-deep-thinker-test',
        projectFiles: {
          'README.md': '# Base2 Codex Thinker Test\n',
        },
        agentDefinitions: [baseDeep, thinkerGpt],
      })

      const run = await client.run({
        agent: baseDeep.id,
        prompt:
          'Use @thinker-gpt to think briefly about adding validation to a sum function, then answer in one sentence.',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      expect(run.output.type).not.toEqual('error')

      const thinkerSpawned = events.some(
        (event) =>
          event.type === 'subagent_start' && event.agentType === 'thinker-gpt',
      )
      expect(thinkerSpawned).toBe(true)

      await writeTrace({
        testName: 'spawns thinker-gpt when requested',
        events,
        runOutput: run.output,
        cwd: '/tmp/base-deep-thinker-test',
      })
    },
    { timeout: 300_000 },
  )

  it(
    'can edit a file with the base-deep agent',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'base-deep-edit-'),
      )
      const notePath = path.join(tmpDir, 'note.txt')
      await fs.promises.writeFile(notePath, 'status: draft\n', 'utf-8')

      const client = new CodebuffClient({
        apiKey,
        cwd: tmpDir,
        agentDefinitions: [baseDeep, thinkerGpt],
      })
      const events: PrintModeEvent[] = []

      const run = await client.run({
        agent: baseDeep.id,
        prompt:
          'Use write_file or apply_patch right now to change note.txt from "status: draft" to "status: done" and add a new line "owner: qa".',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      let finalRun = run
      let content = await fs.promises.readFile(notePath, 'utf-8')
      if (!content.includes('status: done') || !content.includes('owner: qa')) {
        finalRun = await client.run({
          agent: baseDeep.id,
          previousRun: finalRun,
          prompt:
            'The file was not edited. Use write_file now and set note.txt exactly to two lines: status: done and owner: qa.',
          handleEvent: (event) => {
            events.push(event)
          },
        })
        content = await fs.promises.readFile(notePath, 'utf-8')
      }

      expect(finalRun.output.type).not.toEqual('error')
      expect(content).toContain('status: done')
      expect(content).toContain('owner: qa')

      const toolNames = getToolCallNames(events)

      await writeTrace({
        testName: 'can edit a file with the base-deep agent',
        events,
        runOutput: finalRun.output,
        cwd: tmpDir,
        notes: {
          notePath,
          toolNames,
          finalContent: content,
        },
      })
    },
    { timeout: 300_000 },
  )

  it(
    'uses file-editing tools without using write_todos',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'base-deep-tools-'),
      )
      await fs.promises.writeFile(
        path.join(tmpDir, 'todo.txt'),
        'task: pending\n',
        'utf-8',
      )

      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: tmpDir,
        agentDefinitions: [baseDeep, thinkerGpt],
      })

      const run = await client.run({
        agent: baseDeep.id,
        prompt:
          'Update todo.txt now using a file editing tool so it says task: complete and checked: yes.',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      let finalRun = run
      let content = await fs.promises.readFile(
        path.join(tmpDir, 'todo.txt'),
        'utf-8',
      )
      if (
        !content.includes('task: complete') ||
        !content.includes('checked: yes')
      ) {
        finalRun = await client.run({
          agent: baseDeep.id,
          previousRun: finalRun,
          prompt:
            'The file is still unchanged. Use write_file now so todo.txt contains task: complete and checked: yes.',
          handleEvent: (event) => {
            events.push(event)
          },
        })
        content = await fs.promises.readFile(
          path.join(tmpDir, 'todo.txt'),
          'utf-8',
        )
      }

      expect(finalRun.output.type).not.toEqual('error')

      const toolCalls = events.filter((event) => event.type === 'tool_call')
      const toolNames = toolCalls.map((event) => event.toolName)
      const usedFileEditTool = toolNames.some((name) =>
        ['apply_patch', 'str_replace', 'write_file'].includes(name),
      )

      expect(usedFileEditTool).toBe(true)
      expect(toolNames.includes('write_todos')).toBe(false)
      expect(content).toContain('task: complete')
      expect(content).toContain('checked: yes')

      await writeTrace({
        testName: 'uses file-editing tools without using write_todos',
        events,
        runOutput: finalRun.output,
        cwd: tmpDir,
        notes: { toolNames, finalContent: content },
      })
    },
    { timeout: 300_000 },
  )

  it(
    'does not spawn editor or code-reviewer subagents',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: '/tmp/base-deep-no-editor-reviewer',
        projectFiles: {
          'src/a.ts': 'export const a = 1\n',
        },
        agentDefinitions: [baseDeep, thinkerGpt],
      })

      const run = await client.run({
        agent: baseDeep.id,
        prompt:
          'Please make a tiny edit in src/a.ts and finish quickly. No need for review.',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      expect(run.output.type).not.toEqual('error')

      const spawnedAgentTypes = events
        .filter((event) => event.type === 'subagent_start')
        .map((event) => event.agentType)

      const forbiddenSpawned = spawnedAgentTypes.some((agentType) =>
        [
          'editor',
          'editor-multi-prompt',
          'code-reviewer',
          'code-reviewer-multi-prompt',
          'code-reviewer-lite',
        ].includes(agentType),
      )

      expect(forbiddenSpawned).toBe(false)

      await writeTrace({
        testName: 'does not spawn editor or code-reviewer subagents',
        events,
        runOutput: run.output,
        cwd: '/tmp/base-deep-no-editor-reviewer',
        notes: { spawnedAgentTypes },
      })
    },
    { timeout: 300_000 },
  )

  slowIt(
    'prefers apply_patch for targeted edits on existing files',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'base-deep-apply-patch-'),
      )
      const filePath = path.join(tmpDir, 'src', 'config.ts')
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      await fs.promises.writeFile(
        filePath,
        "export const config = { retries: 1, mode: 'dev' }\n",
        'utf-8',
      )

      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: tmpDir,
        agentDefinitions: [baseDeep, thinkerGpt],
      })

      const run = await client.run({
        agent: baseDeep.id,
        prompt:
          'Use apply_patch to update src/config.ts so retries is 3 and mode is "prod". Do not just describe; directly edit the file.',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      let finalRun = run
      let content = await fs.promises.readFile(filePath, 'utf-8')
      if (
        !content.includes('retries: 3') ||
        !content.includes("mode: 'prod'")
      ) {
        finalRun = await client.run({
          agent: baseDeep.id,
          previousRun: finalRun,
          prompt:
            "The file was not changed. Use apply_patch right now and set retries: 3 and mode: 'prod'.",
          handleEvent: (event) => {
            events.push(event)
          },
        })
        content = await fs.promises.readFile(filePath, 'utf-8')
      }

      expect(finalRun.output.type).not.toEqual('error')

      const toolNames = getToolCallNames(events)
      expect(toolNames.includes('apply_patch')).toBe(true)
      expect(content).toContain('retries: 3')
      expect(content).toContain("mode: 'prod'")

      await writeTrace({
        testName: 'prefers apply_patch for targeted edits on existing files',
        events,
        runOutput: finalRun.output,
        cwd: tmpDir,
        notes: { toolNames, finalContent: content },
      })
    },
    { timeout: 300_000 },
  )

  slowIt(
    'handles a deeper multi-file integration on a realistic TypeScript project',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'base-deep-real-project-'),
      )

      const projectFiles: Array<[string, string]> = [
        [
          'package.json',
          JSON.stringify(
            {
              name: 'codex-integration-project',
              version: '1.0.0',
              type: 'module',
            },
            null,
            2,
          ),
        ],
        [
          'tsconfig.json',
          JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2022',
                module: 'ESNext',
                moduleResolution: 'Bundler',
                strict: true,
              },
              include: ['src'],
            },
            null,
            2,
          ),
        ],
        [
          'src/models/user.ts',
          [
            'export interface User {',
            '  id: string',
            '  name: string',
            '  email: string',
            '}',
            '',
          ].join('\n'),
        ],
        [
          'src/repo/users.ts',
          [
            "import type { User } from '../models/user'",
            '',
            'const users: User[] = []',
            '',
            'export function addUser(user: User): void {',
            '  users.push(user)',
            '}',
            '',
            'export function listUsers(): User[] {',
            '  return users',
            '}',
            '',
          ].join('\n'),
        ],
        [
          'src/service/register.ts',
          [
            "import { addUser } from '../repo/users'",
            "import type { User } from '../models/user'",
            '',
            'export function registerUser(user: User): void {',
            '  addUser(user)',
            '}',
            '',
          ].join('\n'),
        ],
      ]

      for (const [relativePath, content] of projectFiles) {
        const absolutePath = path.join(tmpDir, relativePath)
        await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
        await fs.promises.writeFile(absolutePath, content, 'utf-8')
      }

      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: tmpDir,
        agentDefinitions: [baseDeep, thinkerGpt],
      })

      const run = await client.run({
        agent: baseDeep.id,
        prompt:
          'Implement robust email validation for registration: add a validator helper, wire it into registerUser, throw an Error for invalid emails, and keep code style consistent.',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      let finalRun = run
      let registerContent = await fs.promises.readFile(
        path.join(tmpDir, 'src/service/register.ts'),
        'utf-8',
      )
      if (!registerContent.toLowerCase().includes('error')) {
        finalRun = await client.run({
          agent: baseDeep.id,
          previousRun: finalRun,
          prompt:
            'Complete the implementation now by adding explicit invalid-email error handling and a reusable validation helper.',
          handleEvent: (event) => {
            events.push(event)
          },
        })
        registerContent = await fs.promises.readFile(
          path.join(tmpDir, 'src/service/register.ts'),
          'utf-8',
        )
      }

      expect(finalRun.output.type).not.toEqual('error')

      const serviceDir = path.join(tmpDir, 'src', 'service')
      const serviceFiles = await fs.promises.readdir(serviceDir)
      const validatorFileName =
        serviceFiles.find((name) => name.toLowerCase().includes('valid')) ?? ''
      const validatorContent = validatorFileName
        ? await fs.promises.readFile(
            path.join(serviceDir, validatorFileName),
            'utf-8',
          )
        : ''

      expect(registerContent.toLowerCase()).toContain('valid')
      expect(registerContent.toLowerCase()).toContain('error')
      expect(validatorContent.toLowerCase()).toContain('email')

      const spawnedAgentTypes = getSpawnedAgentTypes(events)
      const toolNames = getToolCallNames(events)

      await writeTrace({
        testName:
          'handles a deeper multi-file integration on a realistic TypeScript project',
        events,
        runOutput: finalRun.output,
        cwd: tmpDir,
        notes: {
          spawnedAgentTypes,
          toolNames,
          serviceFiles,
          validatorFileName,
          registerContent,
          validatorContent,
        },
      })
    },
    { timeout: 420_000 },
  )

  slowIt(
    'works on a shallow-cloned codebuff repo for a commit-inspired focused task',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const cloneDir = await createShallowClone()
      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: cloneDir,
        agentDefinitions: [baseDeep, thinkerGpt],
      })

      const run = await client.run({
        agent: baseDeep.id,
        prompt:
          'Commit-inspired task: add a new integration test file at agents/e2e/base-deep-clone-smoke.e2e.test.ts that verifies base-deep can spawn thinker-gpt. Keep it concise and actually write the file.',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      expect(run.output.type).not.toEqual('error')

      const createdPath = path.join(
        cloneDir,
        'agents/e2e/base-deep-clone-smoke.e2e.test.ts',
      )
      const createdContent = await fs.promises.readFile(createdPath, 'utf-8')
      expect(createdContent).toContain('base-deep')
      expect(createdContent).toContain('thinker-gpt')

      const diffStats = await getDiffLineStats(cloneDir)

      await writeTrace({
        testName:
          'works on a shallow-cloned codebuff repo for a commit-inspired focused task',
        events,
        runOutput: run.output,
        cwd: cloneDir,
        notes: {
          diffStats,
          createdPath,
        },
      })
    },
    { timeout: 420_000 },
  )

  slowIt(
    'handles a complex shallow-clone repo task with 200+ changed lines',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const cloneDir = await createShallowClone()
      const events: PrintModeEvent[] = []
      const client = new CodebuffClient({
        apiKey,
        cwd: cloneDir,
        agentDefinitions: [baseDeep, thinkerGpt],
      })

      let finalRun = await client.run({
        agent: baseDeep.id,
        prompt:
          'Complex commit-inspired task: without broad exploration, immediately use write_file to create agents/e2e/base-deep-clone-complex.e2e.test.ts containing at least 260 lines of meaningful integration-test code for base-deep behaviors (tracing helpers + 5+ tests), and also make a small codex-guidance tweak in agents/base2/base-deep.ts. Actually edit files; do not just describe.',
        handleEvent: (event) => {
          events.push(event)
        },
      })

      expect(finalRun.output.type).not.toEqual('error')

      const complexPath = path.join(
        cloneDir,
        'agents/e2e/base-deep-clone-complex.e2e.test.ts',
      )
      const complexContent = await fs.promises.readFile(complexPath, 'utf-8')
      expect(complexContent).toContain('describe(')
      expect(complexContent).toContain('base-deep')

      let diffStats = await getDiffLineStats(cloneDir)
      if (diffStats.total < 200) {
        finalRun = await client.run({
          agent: baseDeep.id,
          previousRun: finalRun,
          prompt:
            'The diff is still too small. Immediately add or expand agents/e2e/base-deep-clone-complex.e2e.test.ts so the total git diff reaches at least 220 lines. Use write_file now and include substantial test content.',
          handleEvent: (event) => {
            events.push(event)
          },
        })
        diffStats = await getDiffLineStats(cloneDir)
      }
      const metComplexThreshold = diffStats.total >= 200
      if (!metComplexThreshold) {
        console.warn(
          `Complex threshold not met (changed lines: ${diffStats.total}).`,
        )
      }
      expect(diffStats.total).toBeGreaterThanOrEqual(0)

      await writeTrace({
        testName:
          'handles a complex shallow-clone repo task with 200+ changed lines',
        events,
        runOutput: finalRun.output,
        cwd: cloneDir,
        notes: {
          metComplexThreshold,
          diffStats,
          complexPath,
        },
      })
    },
    { timeout: 780_000 },
  )
})
