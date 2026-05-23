import fs from 'fs'
import os from 'os'
import path from 'path'

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'

import {
  isChatGptOAuthRateLimited,
  markChatGptOAuthRateLimited,
  resetChatGptOAuthRateLimit,
  getModelForRequest,
  applyConfiguredProviderRequestCompatibility,
} from '../impl/model-provider'
import {
  LEGACY_PROVIDER_CONFIG_ENV_VAR,
  PROVIDER_CONFIG_ENV_VAR,
  OPENBUFF_PROVIDER_PRESETS,
  createProviderPresetConfig,
  loadProviderConfigSync,
  providerConfigFileSchema,
  resolveConfiguredAgentModel,
  resolveConfiguredAgentModelConfig,
  resolveConfiguredProviderModel,
  writeProviderConfigFile,
} from '../provider-config'

const originalEnv = { ...process.env }
const originalCwd = process.cwd()

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)
}

describe('model-provider', () => {
  beforeEach(() => {
    resetEnv()
    delete process.env[PROVIDER_CONFIG_ENV_VAR]
    delete process.env[LEGACY_PROVIDER_CONFIG_ENV_VAR]
  })

  afterEach(() => {
    resetEnv()
    process.chdir(originalCwd)
  })

  describe('custom provider config', () => {
    test('accepts providers and OpenCode-style provider aliases', () => {
      const result = providerConfigFileSchema.safeParse({
        provider: {
          'opencode-go': {
            type: 'openai-compatible',
            baseURL: 'https://opencode.ai/zen/go/v1',
            apiKeyEnv: 'OPENCODE_GO_API_KEY',
            models: ['kimi-k2.6'],
          },
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const provider = result.data.providers['opencode-go']
        expect(provider?.type).toBe('openai-compatible')
        expect(provider?.type === 'openai-compatible' && provider.baseURL).toBe(
          'https://opencode.ai/zen/go/v1',
        )
      }
    })

    test('resolves provider-prefixed model ids to provider model ids', () => {
      process.env.OPENCODE_GO_API_KEY = 'test-key'

      const resolved = resolveConfiguredProviderModel({
        model: 'opencode-go/kimi-k2.6',
        loadedConfig: {
          sourceFilePaths: [],
          config: {
            defaultModel: undefined,
            defaultReasoningEffort: undefined,
            modes: {},
            modeReasoningEfforts: {},
            agents: {},
            agentReasoningEfforts: {},
            providers: {
              'opencode-go': {
                type: 'openai-compatible',
                baseURL: 'https://opencode.ai/zen/go/v1',
                apiKeyEnv: 'OPENCODE_GO_API_KEY',
                models: ['kimi-k2.6'],
                supportsStructuredOutputs: false,
                compatibility: {
                  stripCacheControl: true,
                  stringifyTextContent: true,
                  supportsTools: true,
                  supportsRequiredToolChoice: true,
                  stripProviderMetadata: true,
                },
              },
            },
          },
        },
      })

      expect(resolved?.providerId).toBe('opencode-go')
      expect(resolved?.providerModel).toBe('kimi-k2.6')
      expect(resolved?.apiKey).toBe('test-key')
    })



    test('disables DeepSeek thinking mode for OpenAI-compatible tool loops', () => {
      const transformed = applyConfiguredProviderRequestCompatibility(
        {
          model: 'deepseek-v4-pro',
          messages: [{ role: 'user', content: 'hello' }],
          reasoning_effort: 'high',
          tool_choice: 'required',
        },
        { providerModel: 'deepseek-v4-pro' },
      )

      expect(transformed.thinking).toEqual({ type: 'disabled' })
      expect(transformed.reasoning_effort).toBeUndefined()
      expect(transformed.tool_choice).toBeUndefined()
    })

    test('downgrades required tool choice for GLM-compatible providers', () => {
      const transformed = applyConfiguredProviderRequestCompatibility(
        {
          model: 'glm-5.1',
          messages: [{ role: 'user', content: 'hello' }],
          tool_choice: 'required',
        },
        { providerModel: 'glm-5.1' },
      )

      expect(transformed.tool_choice).toBeUndefined()
      expect(transformed.thinking).toBeUndefined()
    })

    test('downgrades required tool choice for providers that opt out', () => {
      const transformed = applyConfiguredProviderRequestCompatibility(
        {
          model: 'custom-coder',
          messages: [{ role: 'user', content: 'hello' }],
          tool_choice: 'required',
        },
        {
          providerModel: 'custom-coder',
          compatibility: {
            supportsRequiredToolChoice: false,
          },
        },
      )

      expect(transformed.tool_choice).toBeUndefined()
      expect(transformed.thinking).toBeUndefined()
    })

    test('does not add DeepSeek thinking controls to non-DeepSeek models', () => {
      const body = {
        model: 'kimi-k2.6',
        messages: [{ role: 'user', content: 'hello' }],
        tool_choice: 'required',
      }

      expect(
        applyConfiguredProviderRequestCompatibility(body, {
          providerModel: 'kimi-k2.6',
        }),
      ).toBe(body)
    })

    test('supports explicit requested-to-provider model mappings', () => {
      process.env.CUSTOM_KEY = 'mapped-key'

      const resolved = resolveConfiguredProviderModel({
        model: 'custom/public-name',
        loadedConfig: {
          sourceFilePaths: [],
          config: {
            defaultModel: undefined,
            defaultReasoningEffort: undefined,
            modes: {},
            modeReasoningEfforts: {},
            agents: {},
            agentReasoningEfforts: {},
            providers: {
              custom: {
                type: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKeyEnv: 'CUSTOM_KEY',
                models: {
                  'custom/public-name': 'private-provider-model-name',
                },
                supportsStructuredOutputs: true,
                compatibility: {
                  stripCacheControl: true,
                  stringifyTextContent: true,
                  supportsTools: true,
                  supportsRequiredToolChoice: true,
                  stripProviderMetadata: true,
                },
              },
            },
          },
        },
      })

      expect(resolved?.providerModel).toBe('private-provider-model-name')
      expect(resolved?.provider.type).toBe('openai-compatible')
      expect(
        resolved?.provider.type === 'openai-compatible' &&
          resolved.provider.supportsStructuredOutputs,
      ).toBe(true)
    })

    test('throws a clear error when a matched provider is missing its api key env var', () => {
      expect(() =>
        resolveConfiguredProviderModel({
          model: 'opencode-go/kimi-k2.6',
          env: {},
          loadedConfig: {
            sourceFilePaths: [],
            config: {
              defaultModel: undefined,
              defaultReasoningEffort: undefined,
              modes: {},
              modeReasoningEfforts: {},
              agents: {},
              agentReasoningEfforts: {},
              providers: {
                'opencode-go': {
                  type: 'openai-compatible',
                  baseURL: 'https://opencode.ai/zen/go/v1',
                  apiKeyEnv: 'OPENCODE_GO_API_KEY',
                  models: ['kimi-k2.6'],
                  supportsStructuredOutputs: false,
                  compatibility: {
                    stripCacheControl: true,
                    stringifyTextContent: true,
                    supportsTools: true,
                    supportsRequiredToolChoice: true,
                    stripProviderMetadata: true,
                  },
                },
              },
            },
          },
        }),
      ).toThrow("Missing environment variable 'OPENCODE_GO_API_KEY'")
    })

    test('rejects api keys over plaintext non-local http', () => {
      const result = providerConfigFileSchema.safeParse({
        providers: {
          unsafe: {
            type: 'openai-compatible',
            baseURL: 'http://api.example.com/v1',
            apiKeyEnv: 'UNSAFE_API_KEY',
            models: ['unsafe/model'],
          },
        },
      })

      expect(result.success).toBe(false)
    })

    test('allows unauthenticated local http providers', () => {
      const result = providerConfigFileSchema.safeParse({
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://localhost:11434/v1',
            models: ['llama3.1'],
          },
        },
      })

      expect(result.success).toBe(true)
    })

    test('getModelForRequest returns a configured provider model', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-provider-'))
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['llama3.1'],
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      const result = await getModelForRequest({
        apiKey: 'codebuff-key',
        model: 'local/llama3.1',
      })

      expect(result.isChatGptOAuth).toBe(false)
      expect((result.model as any).provider).toBe('local')
      expect((result.model as any).modelId).toBe('llama3.1')
    })

    test('discovers openbuff.json in an ancestor directory', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-provider-'))
      const childDir = path.join(tempDir, 'nested', 'child')
      fs.mkdirSync(childDir, { recursive: true })
      fs.writeFileSync(
        path.join(tempDir, 'openbuff.json'),
        JSON.stringify({
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['llama3.1'],
            },
          },
        }),
      )

      process.chdir(childDir)

      const loadedConfig = loadProviderConfigSync()

      expect(loadedConfig.sourceFilePaths).toContain(
        path.join(tempDir, 'openbuff.json'),
      )
      expect(loadedConfig.config.providers.local).toBeDefined()
    })

    test('getModelForRequest fails instead of using hosted backend fallback for unmatched models', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-provider-'))
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['llama3.1'],
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      await expect(
        getModelForRequest({
          apiKey: 'openbuff-local-mode',
          model: 'anthropic/claude-sonnet-4.5',
        }),
      ).rejects.toThrow('Openbuff could not route model')
    })

    test('supports default and per-agent model overrides before provider routing', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-provider-'))
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          defaultModel: 'local/qwen-coder',
          agents: {
            thinker: 'local/deep-reasoner',
            'codebuff/agent-builder@1.2.3': { model: 'local/agent-builder' },
          },
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['qwen-coder', 'deep-reasoner', 'agent-builder'],
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      expect(resolveConfiguredAgentModel({
        model: 'anthropic/claude-opus-4.7',
        agentId: 'base2',
      })).toBe('local/qwen-coder')
      expect(resolveConfiguredAgentModel({
        model: 'anthropic/claude-opus-4.7',
        agentId: 'thinker',
      })).toBe('local/deep-reasoner')
      expect(resolveConfiguredAgentModel({
        model: 'anthropic/claude-opus-4.7',
        agentId: 'codebuff/agent-builder@1.2.3',
      })).toBe('local/agent-builder')

      const result = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'anthropic/claude-opus-4.7',
        agentId: 'thinker',
      })
      expect((result.model as any).provider).toBe('local')
      expect((result.model as any).modelId).toBe('deep-reasoner')
    })

    test('supports configurable reasoning effort for defaults, modes, and agents', () => {
      const config = providerConfigFileSchema.parse({
        defaultModel: {
          model: 'local/default-reasoner',
          reasoningEffort: 'low',
        },
        modes: {
          plan: {
            model: 'local/planner',
            reasoningEffort: 'high',
          },
        },
        agents: {
          thinker: {
            model: 'local/thinker',
            reasoningEffort: 'medium',
          },
        },
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://127.0.0.1:11434/v1',
            models: ['default-reasoner', 'planner', 'thinker'],
          },
        },
      })
      const loadedConfig = { sourceFilePaths: [], config }

      expect(
        resolveConfiguredAgentModelConfig({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2',
          loadedConfig,
        }),
      ).toEqual({
        model: 'local/default-reasoner',
        reasoningEffort: 'low',
      })
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2-plan',
          loadedConfig,
        }),
      ).toEqual({
        model: 'local/planner',
        reasoningEffort: 'high',
      })
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'thinker',
          loadedConfig,
        }),
      ).toEqual({
        model: 'local/thinker',
        reasoningEffort: 'medium',
      })
    })

    test('getModelForRequest returns configured reasoning effort with the routed model', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-provider-'))
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          agents: {
            thinker: {
              model: 'local/deep-reasoner',
              reasoningEffort: 'high',
            },
          },
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['deep-reasoner'],
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      const result = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'anthropic/claude-opus-4.7',
        agentId: 'thinker',
      })

      expect((result.model as any).provider).toBe('local')
      expect((result.model as any).modelId).toBe('deep-reasoner')
      expect(result.reasoningEffort).toBe('high')
    })

    test('supports built-in mode routing and provider presets', () => {
      const opencodeConfig = createProviderPresetConfig('opencode-go')

      expect(OPENBUFF_PROVIDER_PRESETS['opencode-go'].label).toBe('OpenCode Go')
      expect(resolveConfiguredAgentModel({
        model: 'anthropic/claude-opus-4.7',
        agentId: 'base2-lite',
        loadedConfig: {
          sourceFilePaths: [],
          config: opencodeConfig,
        },
      })).toBe('opencode-go/deepseek-v4-flash')
      expect(resolveConfiguredAgentModel({
        model: 'anthropic/claude-opus-4.7',
        agentId: 'base2-max',
        loadedConfig: {
          sourceFilePaths: [],
          config: opencodeConfig,
        },
      })).toBe('opencode-go/glm-5.1')
    })

    test('mode routing takes precedence over root agent overrides', () => {
      const config = providerConfigFileSchema.parse({
        defaultModel: 'local/fallback',
        modes: {
          default: 'local/mode-default',
          plan: 'local/mode-plan',
        },
        agents: {
          base2: 'local/agent-base2',
          'base2-plan': 'local/agent-plan',
          thinker: 'local/agent-thinker',
        },
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://127.0.0.1:11434/v1',
            models: [
              'fallback',
              'mode-default',
              'mode-plan',
              'agent-base2',
              'agent-plan',
              'agent-thinker',
            ],
          },
        },
      })

      const loadedConfig = { sourceFilePaths: [], config }

      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2',
          loadedConfig,
        }),
      ).toBe('local/mode-default')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2-plan',
          loadedConfig,
        }),
      ).toBe('local/mode-plan')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'thinker',
          loadedConfig,
        }),
      ).toBe('local/agent-thinker')
    })

    test('supports editorMultiPrompt proposal and selector routing', () => {
      const config = providerConfigFileSchema.parse({
        editorMultiPrompt: {
          proposalModels: [
            { model: 'opencode-go/kimi-k2.6', reasoningEffort: 'low' },
            { model: 'codex/gpt-5.5', reasoningEffort: 'medium' },
            { model: 'opencode-go/glm-5.1', reasoningEffort: 'low' },
          ],
          selectorModel: {
            model: 'codex/gpt-5.5',
            reasoningEffort: 'high',
          },
        },
        providers: {
          'opencode-go': {
            type: 'openai-compatible',
            baseURL: 'https://opencode.ai/zen/go/v1',
            apiKeyEnv: 'OPENCODE_GO_API_KEY',
            models: ['kimi-k2.6', 'glm-5.1'],
          },
          codex: {
            type: 'chatgpt-oauth',
            models: ['gpt-5.5'],
          },
        },
      })

      const loadedConfig = { sourceFilePaths: [], config }

      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'editor-implementor-proposal-1',
          loadedConfig,
        }),
      ).toBe('opencode-go/kimi-k2.6')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'editor-implementor-proposal-2',
          loadedConfig,
        }),
      ).toBe('codex/gpt-5.5')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'editor-implementor-proposal-4',
          loadedConfig,
        }),
      ).toBe('opencode-go/glm-5.1')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'best-of-n-selector2',
          loadedConfig,
        }),
      ).toBe('codex/gpt-5.5')
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'editor-implementor-proposal-2',
          loadedConfig,
        }).reasoningEffort,
      ).toBe('medium')
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'best-of-n-selector2',
          loadedConfig,
        }).reasoningEffort,
      ).toBe('high')
    })

    test('supports Codex subscription as a configurable provider', () => {
      const codexConfig = createProviderPresetConfig('codex')

      expect(OPENBUFF_PROVIDER_PRESETS.codex.label).toBe(
        'Codex / ChatGPT subscription',
      )
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2-plan',
          loadedConfig: {
            sourceFilePaths: [],
            config: codexConfig,
          },
        }),
      ).toBe('codex/gpt-5.5')

      const resolved = resolveConfiguredProviderModel({
        model: 'codex/gpt-5.1-codex',
        loadedConfig: {
          sourceFilePaths: [],
          config: codexConfig,
        },
      })
      expect(resolved?.provider.type).toBe('chatgpt-oauth')
      expect(resolved?.providerModel).toBe('gpt-5.1-codex')
    })

    test('explicit malformed provider config fails clearly', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-provider-'))
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(configPath, JSON.stringify({ provider: 'bad' }))
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      await expect(
        getModelForRequest({
          apiKey: 'codebuff-key',
          model: 'local/llama3.1',
        }),
      ).rejects.toThrow('Invalid provider config')
    })

    test('writeProviderConfigFile merges with existing config instead of overwriting', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-provider-'))
      const cwd = tempDir

      // Write initial config with opencode-go
      const opencodePath = writeProviderConfigFile({
        cwd,
        config: createProviderPresetConfig('opencode-go'),
      })
      const firstConfig = JSON.parse(fs.readFileSync(opencodePath, 'utf8'))
      expect(firstConfig.providers['opencode-go']).toBeDefined()
      expect(firstConfig.providers['openai']).toBeUndefined()

      // Now add openai — should merge, not overwrite
      const openaiPath = writeProviderConfigFile({
        cwd,
        config: createProviderPresetConfig('openai'),
      })
      expect(openaiPath).toBe(opencodePath)

      const mergedConfig = JSON.parse(fs.readFileSync(openaiPath, 'utf8'))
      expect(mergedConfig.providers['opencode-go']).toBeDefined()
      expect(mergedConfig.providers['openai']).toBeDefined()
      expect(mergedConfig.providers['openai'].baseURL).toBe('https://api.openai.com/v1')
    })

    test('writeProviderConfigFile force=true overwrites existing config', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-provider-'))
      const cwd = tempDir

      // Write initial config with opencode-go
      writeProviderConfigFile({
        cwd,
        config: createProviderPresetConfig('opencode-go'),
      })

      // Force overwrite with openai only
      writeProviderConfigFile({
        cwd,
        config: createProviderPresetConfig('openai'),
        force: true,
      })

      const overwrittenConfig = JSON.parse(
        fs.readFileSync(path.join(cwd, 'openbuff.json'), 'utf8'),
      )
      expect(overwrittenConfig.providers['openai']).toBeDefined()
      expect(overwrittenConfig.providers['opencode-go']).toBeUndefined()
    })

    test('writeProviderConfigFile preserves existing modes and agents during merge', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-provider-'))
      const cwd = tempDir

      // Write custom config with specific modes and agents
      fs.writeFileSync(
        path.join(cwd, 'openbuff.json'),
        JSON.stringify({
          defaultModel: 'custom/default',
          modes: { default: 'custom/default', lite: 'custom/lite' },
          agents: { thinker: 'custom/thinker' },
          providers: {
            custom: {
              type: 'openai-compatible',
              baseURL: 'https://api.example.com/v1',
              models: ['default', 'lite'],
            },
          },
        }),
      )

      // Add openai preset — should merge providers but preserve modes/agents
      writeProviderConfigFile({
        cwd,
        config: createProviderPresetConfig('openai'),
      })

      const mergedConfig = JSON.parse(
        fs.readFileSync(path.join(cwd, 'openbuff.json'), 'utf8'),
      )

      // Providers merged
      expect(mergedConfig.providers['custom']).toBeDefined()
      expect(mergedConfig.providers['openai']).toBeDefined()

      // defaultModel, modes, agents preserved
      expect(mergedConfig.defaultModel).toBe('custom/default')
      expect(mergedConfig.modes.default).toBe('custom/default')
      expect(mergedConfig.modes.lite).toBe('custom/lite')
      expect(mergedConfig.agents.thinker).toBe('custom/thinker')
    })

    test('writeProviderConfigFile throws clear error for malformed existing config without force', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-provider-'))
      const cwd = tempDir

      fs.writeFileSync(
        path.join(cwd, 'openbuff.json'),
        '{ "provider": "bad" }',
      )

      expect(() =>
        writeProviderConfigFile({
          cwd,
          config: createProviderPresetConfig('openai'),
        }),
      ).toThrow('Cannot merge with existing config')
    })
  })

  describe('chatgpt oauth rate limiting', () => {
    beforeEach(() => {
      resetChatGptOAuthRateLimit()
    })

    test('isChatGptOAuthRateLimited returns false by default', () => {
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })

    test('markChatGptOAuthRateLimited sets rate limit with default time', () => {
      markChatGptOAuthRateLimited()
      expect(isChatGptOAuthRateLimited()).toBe(true)
    })

    test('markChatGptOAuthRateLimited respects custom reset time', () => {
      const futureDate = new Date(Date.now() + 60_000)
      markChatGptOAuthRateLimited(futureDate)
      expect(isChatGptOAuthRateLimited()).toBe(true)
    })

    test('rate limit expires after reset time', () => {
      const pastDate = new Date(Date.now() - 1_000)
      markChatGptOAuthRateLimited(pastDate)
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })

    test('resetChatGptOAuthRateLimit clears rate limit', () => {
      markChatGptOAuthRateLimited()
      expect(isChatGptOAuthRateLimited()).toBe(true)

      resetChatGptOAuthRateLimit()
      expect(isChatGptOAuthRateLimited()).toBe(false)
    })
  })
})
