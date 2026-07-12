import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { clearProviderConfigCacheForTest } from '@openbuff/sdk'

import { setProjectRoot } from '../../project-files'
import {
  addCustomOpenbuffProvider,
  configureOpenbuffModelFromArgs,
  handleOpenbuffProviderCommand,
  handleOpenbuffProviderWizardInput,
  startOpenbuffProviderWizard,
} from '../openbuff-provider'

const originalProjectRoot = process.cwd()
const originalCwd = process.cwd()
let tempDir: string | undefined

function readOpenbuffConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(tempDir!, 'openbuff.json'), 'utf8'),
  )
}

describe('openbuff-provider custom setup', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-provider-cli-'))
    setProjectRoot(tempDir)
    // loadProviderConfigSync() resolves config paths from process.cwd(), not
    // getProjectRoot(). Chdir to the temp dir so the status command finds the
    // openbuff.json that addCustomOpenbuffProvider writes there. Without this,
    // CI (which has no openbuff.json at the repo root) fails because the status
    // command reads "Config: not found" instead of the written config.
    process.chdir(tempDir)
    clearProviderConfigCacheForTest()
  })

  afterEach(() => {
    setProjectRoot(originalProjectRoot)
    process.chdir(originalCwd)
    clearProviderConfigCacheForTest()
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  test('adds a custom OpenAI-compatible provider', () => {
    const message = addCustomOpenbuffProvider({
      id: 'local',
      type: 'openai-compatible',
      baseURL: 'http://localhost:11434/v1',
      models: ['qwen-coder', 'glm-4.6'],
    })

    expect(message).toContain("Custom openai-compatible provider 'local' added")
    expect(readOpenbuffConfig()).toMatchObject({
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:11434/v1',
          models: ['qwen-coder', 'glm-4.6'],
        },
      },
    })
  })

  test('adds a custom Anthropic-compatible provider', () => {
    const message = addCustomOpenbuffProvider({
      id: 'claude-gateway',
      type: 'anthropic-compatible',
      baseURL: 'https://cc.freemodel.dev',
      apiKeyEnv: 'FREEMODEL_API_KEY',
      models: ['claude-sonnet-4-5'],
    })

    expect(message).toContain(
      "Custom anthropic-compatible provider 'claude-gateway' added",
    )
    expect(readOpenbuffConfig()).toMatchObject({
      providers: {
        'claude-gateway': {
          type: 'anthropic-compatible',
          baseURL: 'https://cc.freemodel.dev',
          apiKeyEnv: 'FREEMODEL_API_KEY',
          models: ['claude-sonnet-4-5'],
        },
      },
    })
  })

  test('provider status command displays loaded config', async () => {
    addCustomOpenbuffProvider({
      id: 'local',
      type: 'openai-compatible',
      baseURL: 'http://localhost:11434/v1',
      models: ['qwen-coder'],
    })

    const result = await handleOpenbuffProviderCommand('status')

    expect(result.message).toContain('Openbuff provider status')
    expect(result.message).toContain('\nProvider presets:\n')
    expect(result.message).toContain('local')
    expect(result.message).not.toContain('\\n')
  })

  test('model route edits preserve unrelated configuration', () => {
    fs.writeFileSync(
      path.join(tempDir!, 'openbuff.json'),
      JSON.stringify(
        {
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://localhost:11434/v1',
              models: ['qwen-coder'],
            },
          },
          defaultModel: 'local/old-model',
          visionModel: 'local/vision-model',
          failoverModels: ['local/fallback-model'],
          maxAgentSteps: 42,
          indexing: { enabled: false },
        },
        null,
        2,
      ),
    )
    clearProviderConfigCacheForTest()

    configureOpenbuffModelFromArgs('set default local/qwen-coder')

    expect(readOpenbuffConfig()).toMatchObject({
      defaultModel: 'local/qwen-coder',
      visionModel: 'local/vision-model',
      failoverModels: ['local/fallback-model'],
      maxAgentSteps: 42,
      indexing: { enabled: false },
    })
  })

  test('recommends only empirically measured models by language and task', () => {
    fs.writeFileSync(
      path.join(tempDir!, 'openbuff.json'),
      JSON.stringify({
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://localhost:11434/v1',
            models: ['rust-specialist', 'unmeasured'],
            modelCapabilities: {
              'rust-specialist': {
                quality: {
                  coding: [
                    {
                      language: 'rust',
                      taskType: 'bugfix',
                      agentRole: 'editor',
                      score: 91,
                      sampleSize: 24,
                      benchmark: 'buffbench-rust-v1',
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    )
    clearProviderConfigCacheForTest()

    const message = configureOpenbuffModelFromArgs(
      'recommend rust bugfix editor',
    )
    expect(message).toContain('Recommended model: local/rust-specialist')
    expect(message).toContain('91/100 across 24 samples')
    expect(message).toContain('buffbench-rust-v1')
  })

  test('custom provider wizard validates URL and API key env before writing', () => {
    expect(startOpenbuffProviderWizard()).toContain('Openbuff provider wizard')
    expect(handleOpenbuffProviderWizardInput('custom')).toMatchObject({
      done: false,
    })
    expect(handleOpenbuffProviderWizardInput('claude-gateway')).toMatchObject({
      done: false,
    })
    expect(
      handleOpenbuffProviderWizardInput('anthropic-compatible'),
    ).toMatchObject({
      done: false,
    })

    const invalidUrl = handleOpenbuffProviderWizardInput('not-a-url')
    expect(invalidUrl.done).toBe(false)
    expect(invalidUrl.message).toContain('valid base URL')
    expect(fs.existsSync(path.join(tempDir!, 'openbuff.json'))).toBe(false)

    expect(
      handleOpenbuffProviderWizardInput('https://cc.freemodel.dev'),
    ).toMatchObject({
      done: false,
    })

    const invalidEnv = handleOpenbuffProviderWizardInput('bad-key')
    expect(invalidEnv.done).toBe(false)
    expect(invalidEnv.message).toContain('environment variable name')
    expect(fs.existsSync(path.join(tempDir!, 'openbuff.json'))).toBe(false)

    expect(
      handleOpenbuffProviderWizardInput('FREEMODEL_API_KEY'),
    ).toMatchObject({
      done: false,
    })
    const done = handleOpenbuffProviderWizardInput('claude-sonnet-4-5')

    expect(done.done).toBe(true)
    expect(done.message).toContain(
      "Custom anthropic-compatible provider 'claude-gateway' added",
    )
    expect(readOpenbuffConfig()).toMatchObject({
      providers: {
        'claude-gateway': {
          type: 'anthropic-compatible',
          baseURL: 'https://cc.freemodel.dev',
          apiKeyEnv: 'FREEMODEL_API_KEY',
          models: ['claude-sonnet-4-5'],
        },
      },
    })
  })
})
