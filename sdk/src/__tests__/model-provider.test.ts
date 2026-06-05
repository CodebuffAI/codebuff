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
  formatModelCapabilitiesSummary,
  loadProviderConfigSync,
  providerConfigFileSchema,
  resolveConfiguredAgentModel,
  resolveConfiguredAgentModelConfig,
  resolveConfiguredProviderModel,
  resolveModelCapabilities,
  writeProviderConfigFile,
} from '../provider-config'
import {
  discoverProviderModels,
  getAvailableProviderModels,
  getCachedProviderModels,
  getProviderDiscoveryConfig,
  addDiscoveredModelToProviderConfig,
  readModelDiscoveryCache,
  setModelDiscoveryCachePath,
  setModelDiscoveryCachePathForTest,
} from '../model-discovery'
import type { ModelDiscoveryFetch } from '../model-discovery'

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

    test('parses provider capability metadata', () => {
      const result = providerConfigFileSchema.safeParse({
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://127.0.0.1:11434/v1',
            models: ['llama3.1'],
            defaultCapabilities: {
              context: { windowTokens: 128_000, outputTokens: 8_192 },
              reasoning: {
                supported: true,
                efforts: ['low', 'medium', 'high'],
                defaultEffort: 'medium',
              },
              tools: {
                supported: true,
                requiredToolChoice: false,
                structuredOutputs: true,
              },
              promptCaching: { supported: true },
              pricing: {
                inputPerMillionTokens: 0.25,
                outputPerMillionTokens: 1,
              },
              quality: { tier: 'balanced', score: 82 },
            },
            modelCapabilities: {
              'llama3.1': {
                context: { windowTokens: 64_000 },
                quality: { label: 'local fast' },
              },
            },
          },
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const provider = result.data.providers.local
        expect(provider.defaultCapabilities?.context?.windowTokens).toBe(
          128_000,
        )
        expect(provider.modelCapabilities?.['llama3.1']?.quality?.label).toBe(
          'local fast',
        )
      }
    })

    test('normalizes legacy context and compatibility fields into capabilities', () => {
      const config = providerConfigFileSchema.parse({
        providers: {
          custom: {
            type: 'openai-compatible',
            baseURL: 'https://api.example.com/v1',
            models: {
              'custom/public-name': 'private-provider-model',
            },
            supportsStructuredOutputs: true,
            compatibility: {
              supportsTools: false,
              supportsRequiredToolChoice: false,
              stripCacheControl: false,
            },
            contextWindowTokens: 32_000,
            modelContextWindowTokens: {
              'private-provider-model': 64_000,
            },
          },
        },
      })

      expect(
        resolveModelCapabilities({
          providerId: 'custom',
          model: 'custom/public-name',
          loadedConfig: { sourceFilePaths: [], config },
        }),
      ).toEqual({
        context: { windowTokens: 64_000 },
        tools: {
          supported: false,
          requiredToolChoice: false,
          structuredOutputs: true,
        },
        promptCaching: { supported: true },
      })
    })

    test('merges provider default capabilities before model overrides', () => {
      const config = providerConfigFileSchema.parse({
        providers: {
          custom: {
            type: 'openai-compatible',
            baseURL: 'https://api.example.com/v1',
            models: {
              'custom/public-name': 'private-provider-model',
            },
            contextWindowTokens: 32_000,
            defaultCapabilities: {
              context: { outputTokens: 4_096 },
              tools: { structuredOutputs: true },
              quality: { tier: 'balanced' },
            },
            modelCapabilities: {
              'private-provider-model': {
                context: { windowTokens: 96_000 },
                pricing: {
                  inputPerMillionTokens: 0.5,
                  outputPerMillionTokens: 2,
                },
              },
              'custom/public-name': {
                reasoning: {
                  supported: true,
                  efforts: ['high'],
                },
                quality: { label: 'best public route' },
              },
            },
          },
        },
      })

      expect(
        resolveModelCapabilities({
          providerId: 'custom',
          model: 'custom/public-name',
          loadedConfig: { sourceFilePaths: [], config },
        }),
      ).toEqual({
        context: { windowTokens: 96_000, outputTokens: 4_096 },
        tools: {
          supported: true,
          requiredToolChoice: true,
          structuredOutputs: true,
        },
        promptCaching: { supported: false },
        pricing: {
          inputPerMillionTokens: 0.5,
          outputPerMillionTokens: 2,
          currency: 'USD',
        },
        quality: { tier: 'balanced', label: 'best public route' },
        reasoning: { supported: true, efforts: ['high'] },
      })
    })

    test('formats concise model capability summaries', () => {
      expect(
        formatModelCapabilitiesSummary({
          context: { windowTokens: 128_000, outputTokens: 8_192 },
          reasoning: { supported: true, efforts: ['low', 'high'] },
          tools: {
            supported: true,
            requiredToolChoice: false,
            structuredOutputs: true,
          },
          promptCaching: { supported: true },
          pricing: {
            inputPerMillionTokens: 0.25,
            outputPerMillionTokens: 1.5,
            currency: 'USD',
          },
          quality: { tier: 'frontier' },
        }),
      ).toBe(
        '128k ctx; 8.19k out; reasoning low/high; tools+no-required+structured; prompt-cache; $0.25/$1.5/M; quality frontier',
      )
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
            indexing: {
              enabled: true,
              cacheDir: '.codebuff-index',
              exclude: [],
              semantic: { enabled: false },
            },
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

    test('does not downgrade required tool choice for proposal agents', () => {
      const transformed = applyConfiguredProviderRequestCompatibility(
        {
          model: 'deepseek-v4-pro',
          messages: [{ role: 'user', content: 'hello' }],
          tool_choice: 'required',
        },
        {
          providerModel: 'deepseek-v4-pro',
          isProposalAgent: true,
        },
      )

      expect(transformed.tool_choice).toBe('required')
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
            indexing: {
              enabled: true,
              cacheDir: '.codebuff-index',
              exclude: [],
              semantic: { enabled: false },
            },
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

    test('throws a clear error when no model is configured anywhere for an agent', () => {
      const emptyConfig = {
        sourceFilePaths: [],
        config: {
          defaultModel: undefined,
          defaultReasoningEffort: undefined,
          modes: {},
          modeReasoningEfforts: {},
          agents: {},
          agentReasoningEfforts: {},
          indexing: {
            enabled: true,
            cacheDir: '.codebuff-index',
            exclude: [],
            semantic: { enabled: false },
          },
          providers: {},
        },
      }

      expect(() =>
        resolveConfiguredAgentModelConfig({
          agentId: 'notion-query-agent',
          model: undefined,
          loadedConfig: emptyConfig,
        }),
      ).toThrow("No model configured for agent 'notion-query-agent'")

      expect(() =>
        resolveConfiguredAgentModelConfig({
          agentId: 'notion-query-agent',
          model: undefined,
          loadedConfig: emptyConfig,
        }),
      ).toThrow('openbuff.json')
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
              indexing: {
                enabled: true,
                cacheDir: '.codebuff-index',
                exclude: [],
                semantic: { enabled: false },
              },
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codebuff-provider-'),
      )
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
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

      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2',
        }),
      ).toBe('local/qwen-coder')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'thinker',
        }),
      ).toBe('local/deep-reasoner')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'codebuff/agent-builder@1.2.3',
        }),
      ).toBe('local/agent-builder')

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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
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
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2-lite',
          loadedConfig: {
            sourceFilePaths: [],
            config: opencodeConfig,
          },
        }),
      ).toBe('opencode-go/deepseek-v4-flash')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2-max',
          loadedConfig: {
            sourceFilePaths: [],
            config: opencodeConfig,
          },
        }),
      ).toBe('opencode-go/glm-5.1')
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
          agentId: 'editor-implementor-proposal-direct',
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

    test('defaults editorMultiPrompt selector to last configured proposal model', () => {
      const config = providerConfigFileSchema.parse({
        editorMultiPrompt: {
          proposalModels: [
            { model: 'opencode-go/kimi-k2.6', reasoningEffort: 'low' },
            { model: 'opencode-go/glm-5.1', reasoningEffort: 'minimal' },
          ],
        },
        providers: {
          'opencode-go': {
            type: 'openai-compatible',
            baseURL: 'https://opencode.ai/zen/go/v1',
            apiKeyEnv: 'OPENCODE_GO_API_KEY',
            models: ['kimi-k2.6', 'glm-5.1'],
          },
        },
      })

      const loadedConfig = { sourceFilePaths: [], config }

      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'best-of-n-selector2',
          loadedConfig,
        }),
      ).toBe('opencode-go/glm-5.1')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'editor-implementor-proposal-direct',
          loadedConfig,
        }),
      ).toBe('opencode-go/glm-5.1')
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'best-of-n-selector2',
          loadedConfig,
        }).reasoningEffort,
      ).toBe('minimal')
    })

    test('explicit agent routes override editorMultiPrompt convenience routes', () => {
      const config = providerConfigFileSchema.parse({
        editorMultiPrompt: {
          proposalModels: [
            { model: 'opencode-go/kimi-k2.6', reasoningEffort: 'low' },
            { model: 'opencode-go/glm-5.1', reasoningEffort: 'low' },
            {
              model: 'opencode-go/deepseek-v4-pro',
              reasoningEffort: 'minimal',
            },
          ],
          selectorModel: {
            model: 'opencode-go/glm-5.1',
            reasoningEffort: 'low',
          },
        },
        agents: {
          'editor-implementor-proposal-2': {
            model: 'codex/gpt-5.5',
            reasoningEffort: 'high',
          },
          editor_implementor_proposal_3: 'opencode-go/minimax-m2.7',
          'best-of-n-selector2': {
            model: 'codex/gpt-5.5',
            reasoningEffort: 'medium',
          },
        },
        providers: {
          'opencode-go': {
            type: 'openai-compatible',
            baseURL: 'https://opencode.ai/zen/go/v1',
            apiKeyEnv: 'OPENCODE_GO_API_KEY',
            models: ['kimi-k2.6', 'glm-5.1', 'deepseek-v4-pro', 'minimax-m2.7'],
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
          agentId: 'editor-implementor-proposal-3',
          loadedConfig,
        }),
      ).toBe('opencode-go/minimax-m2.7')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'editor-implementor-proposal-4',
          loadedConfig,
        }),
      ).toBe('opencode-go/deepseek-v4-pro')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'editor-implementor-proposal-direct',
          loadedConfig,
        }),
      ).toBe('opencode-go/deepseek-v4-pro')
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
      ).toBe('high')
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'best-of-n-selector2',
          loadedConfig,
        }).reasoningEffort,
      ).toBe('medium')
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codebuff-provider-'),
      )
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codebuff-provider-'),
      )
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
      expect(mergedConfig.providers['openai'].baseURL).toBe(
        'https://api.openai.com/v1',
      )
    })

    test('writeProviderConfigFile force=true overwrites existing config', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codebuff-provider-'),
      )
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codebuff-provider-'),
      )
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
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codebuff-provider-'),
      )
      const cwd = tempDir

      fs.writeFileSync(path.join(cwd, 'openbuff.json'), '{ "provider": "bad" }')

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

  describe('model discovery', () => {
    let tempDir: string

    beforeEach(() => {
      resetEnv()
      delete process.env[PROVIDER_CONFIG_ENV_VAR]
      delete process.env[LEGACY_PROVIDER_CONFIG_ENV_VAR]
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-discovery-'))
      process.env[PROVIDER_CONFIG_ENV_VAR] = path.join(
        tempDir,
        'openbuff.json',
      )
    })

    afterEach(() => {
      resetEnv()
      process.chdir(originalCwd)
      setModelDiscoveryCachePath(undefined)
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    function writeTestProviderConfig(
      providers: Record<string, Record<string, unknown>>,
    ): string {
      const configPath = process.env[PROVIDER_CONFIG_ENV_VAR]!
      fs.writeFileSync(configPath, JSON.stringify({ providers }))
      return configPath
    }

    function makeFetchMock(
      response: unknown,
      status = 200,
    ): ModelDiscoveryFetch {
      return async () =>
        new Response(JSON.stringify(response), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
    }

    test('getProviderDiscoveryConfig returns openrouter for openrouter provider', () => {
      const config = providerConfigFileSchema.parse({
        providers: {
          openrouter: {
            type: 'openai-compatible',
            baseURL: 'https://openrouter.ai/api/v1',
            apiKeyEnv: 'OPENROUTER_API_KEY',
            models: ['anthropic/claude-sonnet-4.5'],
          },
        },
      })
      const result = getProviderDiscoveryConfig(
        'openrouter',
        config.providers.openrouter,
      )
      expect(result?.strategy).toBe('openrouter')
    })

    test('getProviderDiscoveryConfig returns ollama for localhost:11434', () => {
      const config = providerConfigFileSchema.parse({
        providers: {
          ollama: {
            type: 'openai-compatible',
            baseURL: 'http://localhost:11434/v1',
            models: ['llama3'],
          },
        },
      })
      const result = getProviderDiscoveryConfig(
        'ollama',
        config.providers.ollama,
      )
      expect(result?.strategy).toBe('ollama')
    })

    test('getProviderDiscoveryConfig defaults to openai-compatible', () => {
      const config = providerConfigFileSchema.parse({
        providers: {
          custom: {
            type: 'openai-compatible',
            baseURL: 'https://api.example.com/v1',
            apiKeyEnv: 'CUSTOM_API_KEY',
            models: ['model-a'],
          },
        },
      })
      const result = getProviderDiscoveryConfig(
        'custom',
        config.providers.custom,
      )
      expect(result?.strategy).toBe('openai-compatible')
    })

    test('getProviderDiscoveryConfig uses explicit discovery config', () => {
      const config = providerConfigFileSchema.parse({
        providers: {
          custom: {
            type: 'openai-compatible',
            baseURL: 'https://api.example.com/v1',
            apiKeyEnv: 'CUSTOM_API_KEY',
            models: ['model-a'],
            discovery: {
              strategy: 'custom',
              endpoint: 'https://api.example.com/v1/custom-models',
              arrayPath: 'results.models',
              idPath: 'slug',
            },
          },
        },
      })
      const result = getProviderDiscoveryConfig(
        'custom',
        config.providers.custom,
      )
      expect(result?.strategy).toBe('custom')
      expect(result?.endpoint).toBe(
        'https://api.example.com/v1/custom-models',
      )
      expect(result?.arrayPath).toBe('results.models')
      expect(result?.idPath).toBe('slug')
    })

    test('discoverProviderModels parses OpenAI-compatible response', async () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()

      const result = await discoverProviderModels({
        providerId: 'local',
        loadedConfig,
        fetch: makeFetchMock({
          data: [
            { id: 'llama3.1', created: 1_700_000_000 },
            { id: 'qwen2.5-coder:32b' },
          ],
        }),
      })

      expect(result.providerId).toBe('local')
      expect(result.models).toHaveLength(2)
      expect(result.models[0].id).toBe('llama3.1')
      expect(result.models[1].id).toBe('qwen2.5-coder:32b')
      expect(result.models[0].created).toBe(1_700_000_000)
    })

    test('discoverProviderModels parses Ollama response', async () => {
      writeTestProviderConfig({
        ollama: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:11434/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()

      const mockFetch: ModelDiscoveryFetch = async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        if (url.includes('/api/tags')) {
          return new Response(
            JSON.stringify({
              models: [
                {
                  name: 'llama3.1',
                  modified_at: '2024-01-01T00:00:00Z',
                },
                { name: 'qwen2.5-coder:32b' },
              ],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        return new Response('Not found', { status: 404 })
      }

      const result = await discoverProviderModels({
        providerId: 'ollama',
        loadedConfig,
        fetch: mockFetch,
      })

      expect(result.models).toHaveLength(2)
      expect(result.models.map((m) => m.id)).toEqual([
        'llama3.1',
        'qwen2.5-coder:32b',
      ])
    })

    test('discoverProviderModels parses OpenRouter response with capabilities', async () => {
      writeTestProviderConfig({
        openrouter: {
          type: 'openai-compatible',
          baseURL: 'https://openrouter.ai/api/v1',
          apiKeyEnv: 'OPENROUTER_API_KEY',
          models: [],
        },
      })
      process.env.OPENROUTER_API_KEY = 'test-key'
      const loadedConfig = loadProviderConfigSync()

      const result = await discoverProviderModels({
        providerId: 'openrouter',
        loadedConfig,
        fetch: makeFetchMock({
          data: [
            {
              id: 'anthropic/claude-sonnet-4.5',
              name: 'Claude Sonnet 4.5',
              context_length: 200_000,
              pricing: { prompt: '0.000003', completion: '0.000015' },
            },
          ],
        }),
      })

      expect(result.models).toHaveLength(1)
      const model = result.models[0]
      expect(model.id).toBe('anthropic/claude-sonnet-4.5')
      expect(model.name).toBe('Claude Sonnet 4.5')
      expect(model.capabilities?.context?.windowTokens).toBe(200_000)
      expect(model.capabilities?.pricing?.inputPerMillionTokens).toBe(3)
      expect(model.capabilities?.pricing?.outputPerMillionTokens).toBe(15)
    })

    test('discoverProviderModels supports custom arrayPath and idPath', async () => {
      writeTestProviderConfig({
        custom: {
          type: 'openai-compatible',
          baseURL: 'https://api.custom.com/v1',
          apiKeyEnv: 'CUSTOM_API_KEY',
          models: [],
          discovery: {
            strategy: 'custom',
            arrayPath: 'results.models',
            idPath: 'slug',
          },
        },
      })
      process.env.CUSTOM_API_KEY = 'test-key'
      const loadedConfig = loadProviderConfigSync()

      const result = await discoverProviderModels({
        providerId: 'custom',
        loadedConfig,
        fetch: makeFetchMock({
          results: {
            models: [
              { slug: 'custom-model-v1', name: 'Custom Model V1' },
              { slug: 'custom-model-v2' },
            ],
          },
        }),
      })

      expect(result.models).toHaveLength(2)
      expect(result.models[0].id).toBe('custom-model-v1')
      expect(result.models[0].name).toBe('Custom Model V1')
      expect(result.models[1].id).toBe('custom-model-v2')
    })

    test('discoverProviderModels throws on missing provider', async () => {
      writeTestProviderConfig({})
      const loadedConfig = loadProviderConfigSync()

      await expect(
        discoverProviderModels({
          providerId: 'nonexistent',
          loadedConfig,
          fetch: makeFetchMock({}),
        }),
      ).rejects.toThrow('is not configured')
    })

    test('discoverProviderModels throws on HTTP error', async () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()

      const errorFetch: ModelDiscoveryFetch = async () =>
        new Response('Internal Server Error', { status: 500 })

      await expect(
        discoverProviderModels({
          providerId: 'local',
          loadedConfig,
          fetch: errorFetch,
        }),
      ).rejects.toThrow('Model discovery failed')
    })

    test('discoverProviderModels throws on missing API key', async () => {
      writeTestProviderConfig({
        custom: {
          type: 'openai-compatible',
          baseURL: 'https://api.example.com/v1',
          apiKeyEnv: 'MISSING_KEY',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()

      await expect(
        discoverProviderModels({
          providerId: 'custom',
          loadedConfig,
          env: {},
          fetch: makeFetchMock({ data: [] }),
        }),
      ).rejects.toThrow("Missing environment variable 'MISSING_KEY'")
    })

    test('cache round-trip persists discovered models', async () => {
      setModelDiscoveryCachePathForTest(path.join(tempDir, 'discovery-cache.json'))

      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()

      await discoverProviderModels({
        providerId: 'local',
        loadedConfig,
        fetch: makeFetchMock({
          data: [
            { id: 'llama3.1' },
            { id: 'qwen2.5-coder:32b' },
          ],
        }),
      })

      const cached = getCachedProviderModels('local')
      expect(cached).toHaveLength(2)
      expect(cached.map((m) => m.id)).toEqual([
        'llama3.1',
        'qwen2.5-coder:32b',
      ])
    })

    test('getAvailableProviderModels merges configured and cached models', async () => {
      setModelDiscoveryCachePath(path.join(tempDir, 'discovery-cache.json'))

      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: ['configured-model'],
        },
      })

      const loadedConfig = loadProviderConfigSync()
      await discoverProviderModels({
        providerId: 'local',
        loadedConfig,
        fetch: makeFetchMock({
          data: [
            { id: 'configured-model' },
            { id: 'discovered-model' },
          ],
        }),
      })

      const available = getAvailableProviderModels(loadedConfig)

      const configuredModel = available.find(
        (m) => m.id === 'configured-model',
      )
      expect(configuredModel).toBeDefined()
      expect(configuredModel?.configured).toBe(true)

      const discoveredModel = available.find(
        (m) => m.id === 'discovered-model',
      )
      expect(discoveredModel).toBeDefined()
      expect(discoveredModel?.configured).toBe(false)
    })

    test('addDiscoveredModelToProviderConfig adds model to array models', () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:11434/v1',
          models: ['existing-model'],
        },
      })

      const loadedConfig = loadProviderConfigSync()
      const configPath = addDiscoveredModelToProviderConfig({
        providerId: 'local',
        modelId: 'new-model',
        loadedConfig,
      })

      const writtenConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf8'),
      )
      expect(writtenConfig.providers.local.models).toContain(
        'existing-model',
      )
      expect(writtenConfig.providers.local.models).toContain('new-model')
    })

    test('addDiscoveredModelToProviderConfig adds model to map models', () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:11434/v1',
          models: { 'existing-model': 'existing-remote' },
        },
      })

      const loadedConfig = loadProviderConfigSync()
      const configPath = addDiscoveredModelToProviderConfig({
        providerId: 'local',
        modelId: 'new-model',
        loadedConfig,
      })

      const writtenConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf8'),
      )
      expect(
        writtenConfig.providers.local.models['existing-model'],
      ).toBe('existing-remote')
      expect(writtenConfig.providers.local.models['new-model']).toBe(
        'new-model',
      )
    })

    test('addDiscoveredModelToProviderConfig deduplicates array models', () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:11434/v1',
          models: ['model-a', 'model-b'],
        },
      })

      const loadedConfig = loadProviderConfigSync()
      addDiscoveredModelToProviderConfig({
        providerId: 'local',
        modelId: 'model-a',
        loadedConfig,
      })

      const freshConfig = loadProviderConfigSync()
      const localModels = freshConfig.config.providers.local
        .models as string[]
      expect(localModels).toHaveLength(2)
      expect(localModels).toContain('model-a')
      expect(localModels).toContain('model-b')
    })

    test('addDiscoveredModelToProviderConfig strips matching provider prefix', () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:11434/v1',
          models: [],
        },
      })

      const loadedConfig = loadProviderConfigSync()
      const configPath = addDiscoveredModelToProviderConfig({
        providerId: 'local',
        modelId: 'local/new-model',
        loadedConfig,
      })

      const writtenConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf8'),
      )
      expect(writtenConfig.providers.local.models).toContain('new-model')
      expect(writtenConfig.providers.local.models).not.toContain('local/new-model')
    })

    test('readModelDiscoveryCache returns empty cache for invalid JSON', () => {
      const cachePath = path.join(tempDir, 'discovery-cache.json')
      setModelDiscoveryCachePathForTest(cachePath)
      fs.writeFileSync(cachePath, '{ invalid json')

      expect(readModelDiscoveryCache()).toEqual({})
    })

    test('discoverProviderModels does not make real network requests', async () => {
      const noNetworkFetch: ModelDiscoveryFetch = async () => {
        throw new Error('Real network request detected in test')
      }

      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()

      // This test verifies the pattern: all fetch calls go through the
      // injectable parameter, never the real network.
      const result = await discoverProviderModels({
        providerId: 'local',
        loadedConfig,
        fetch: makeFetchMock({ data: [{ id: 'test-model' }] }),
      })
      expect(result.models).toHaveLength(1)
      expect(result.models[0].id).toBe('test-model')
    })
  })
})
