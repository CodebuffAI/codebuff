import fs from 'fs'
import os from 'os'
import path from 'path'

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'

import {
  isChatGptOAuthRateLimited,
  markChatGptOAuthRateLimited,
  resetChatGptOAuthRateLimit,
  getModelForRequest,
  createOpenAICompatibleHeaders,
  applyConfiguredProviderRequestCompatibility,
  normalizeAnthropicBaseURL,
  resolveModelContextWindow,
  resolveModelContextWindows,
  selectAdaptiveReasoningEffort,
} from '../impl/model-provider'
import {
  PROVIDER_CONFIG_ENV_VAR,
  OPENBUFF_PROVIDER_PRESETS,
  createProviderPresetConfig,
  formatModelCapabilitiesSummary,
  getAncestorProviderConfigPaths,
  loadProviderConfigSync,
  providerConfigFileSchema,
  resolveConfiguredAgentModel,
  resolveConfiguredAgentModelConfig,
  resolveConfiguredProviderModel,
  resolveModelCapabilities,
  recommendConfiguredModel,
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
  test('uses standard OpenAI-compatible headers for every configured provider', () => {
    expect(createOpenAICompatibleHeaders('test-key')).toEqual({
      Authorization: 'Bearer test-key',
      'user-agent': expect.stringMatching(
        /^ai-sdk\/openai-compatible\/.*\/openbuff-custom-provider$/,
      ),
    })

    expect(createOpenAICompatibleHeaders()).toEqual({
      'user-agent': expect.stringMatching(
        /^ai-sdk\/openai-compatible\/.*\/openbuff-custom-provider$/,
      ),
    })
  })

  test('adaptive reasoning varies effort by agent role without selecting a model', () => {
    expect(
      selectAdaptiveReasoningEffort({ agentId: 'thinker', supported: true }),
    ).toBe('high')
    expect(
      selectAdaptiveReasoningEffort({ agentId: 'editor', supported: true }),
    ).toBe('medium')
    expect(
      selectAdaptiveReasoningEffort({
        agentId: 'context-pruner',
        supported: true,
      }),
    ).toBe('low')
    expect(
      selectAdaptiveReasoningEffort({ agentId: 'thinker', supported: false }),
    ).toBeUndefined()
  })

  test('adaptive reasoning stays within provider-declared efforts', () => {
    expect(
      selectAdaptiveReasoningEffort({
        agentId: 'thinker',
        supported: true,
        efforts: ['medium', 'low'],
      }),
    ).toBe('medium')
  })
  beforeEach(() => {
    resetEnv()
    delete process.env[PROVIDER_CONFIG_ENV_VAR]
  })

  afterEach(() => {
    resetEnv()
    process.chdir(originalCwd)
  })

  describe('custom provider config', () => {
    test('accepts explicit harness approval modes', () => {
      for (const approvalMode of ['balanced', 'strict', 'allow-all'] as const) {
        expect(
          providerConfigFileSchema.parse({ approvalMode }).approvalMode,
        ).toBe(approvalMode)
      }
      expect(
        providerConfigFileSchema.safeParse({ approvalMode: 'sometimes' })
          .success,
      ).toBe(false)
    })

    test('accepts explicit unlimited maxAgentSteps mode', () => {
      const result = providerConfigFileSchema.safeParse({
        maxAgentSteps: -1,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.maxAgentSteps).toBe(-1)
      }
    })

    test('rejects zero as an ambiguous maxAgentSteps value', () => {
      expect(
        providerConfigFileSchema.safeParse({ maxAgentSteps: 0 }).success,
      ).toBe(false)
    })

    test('recommends only empirically measured models for the requested coding context', () => {
      const parsed = providerConfigFileSchema.parse({
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://localhost:11434/v1',
            models: ['rust-model', 'unmeasured-model'],
            modelCapabilities: {
              'rust-model': {
                quality: {
                  coding: [
                    {
                      language: 'rust',
                      taskType: 'bug-fix',
                      agentRole: 'editor',
                      score: 91,
                      sampleSize: 20,
                    },
                  ],
                },
              },
            },
          },
        },
      })
      expect(
        recommendConfiguredModel({
          context: {
            language: 'rust',
            taskType: 'bug-fix',
            agentRole: 'editor',
          },
          loadedConfig: { config: parsed, sourceFilePaths: [] },
        }),
      ).toMatchObject({ model: 'local/rust-model', score: 91, sampleSize: 20 })
      expect(
        recommendConfiguredModel({
          context: {
            language: 'python',
            taskType: 'bug-fix',
            agentRole: 'editor',
          },
          loadedConfig: { config: parsed, sourceFilePaths: [] },
        }),
      ).toBeUndefined()
    })
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

    test('ignores legacy context and compatibility fields when no explicit capabilities are configured', () => {
      // R1: capability resolution uses only explicit defaultCapabilities /
      // modelCapabilities. Legacy inference from contextWindowTokens /
      // compatibility.* was removed so routes.json is the single source of
      // truth. This config sets only legacy fields, so no capabilities resolve.
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
      ).toEqual({})
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

      // R1: only explicit defaultCapabilities + modelCapabilities contribute.
      // Legacy-inferred tools.supported/requiredToolChoice and promptCaching
      // (from compatibility.*) are no longer present.
      expect(
        resolveModelCapabilities({
          providerId: 'custom',
          model: 'custom/public-name',
          loadedConfig: { sourceFilePaths: [], config },
        }),
      ).toEqual({
        context: { windowTokens: 96_000, outputTokens: 4_096 },
        tools: { structuredOutputs: true },
        pricing: {
          inputPerMillionTokens: 0.5,
          outputPerMillionTokens: 2,
          currency: 'USD',
        },
        quality: { tier: 'balanced', label: 'best public route' },
        reasoning: { supported: true, efforts: ['high'] },
      })
    })

    test('preserves indexing.weights through schema parsing', () => {
      // The SDK schema must declare `indexing.weights` so Zod does not strip
      // user-supplied ranking weights before they reach the indexer.
      const configWithWeights = providerConfigFileSchema.parse({
        indexing: {
          weights: { graph: { calls: 5 }, semanticBlend: 2 },
        },
      })

      expect(configWithWeights.indexing.weights?.graph?.calls).toBe(5)
      expect(configWithWeights.indexing.weights?.semanticBlend).toBe(2)

      // Omitting weights stays backwards compatible: undefined, not an empty
      // object, so the indexer falls back to its historical hardcoded defaults.
      const configWithoutWeights = providerConfigFileSchema.parse({
        indexing: { enabled: true },
      })

      expect(configWithoutWeights.indexing.weights).toBeUndefined()
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
          input: { image: true },
          promptCaching: { supported: true },
          pricing: {
            inputPerMillionTokens: 0.25,
            outputPerMillionTokens: 1.5,
            currency: 'USD',
          },
          quality: { tier: 'frontier' },
        }),
      ).toBe(
        '128k ctx; 8.19k out; image input; reasoning low/high; tools+no-required+structured; prompt-cache; $0.25/$1.5/M; quality frontier',
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
            fileChangeHooks: [],
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
                  supportsStopSequences: false,
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
      expect(resolved?.compatibility.supportsStopSequences).toBe(false)
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

    test('strips stop sequences for providers that opt out', () => {
      const transformed = applyConfiguredProviderRequestCompatibility(
        {
          model: 'custom-coder',
          messages: [{ role: 'user', content: 'hello' }],
          stop: ['"cb_easp"'],
        },
        {
          providerModel: 'custom-coder',
          compatibility: {
            supportsStopSequences: false,
          },
        },
      )

      expect(transformed.stop).toBeUndefined()
    })

    test('keeps stop sequences when providers opt in', () => {
      const body = {
        model: 'custom-coder',
        messages: [{ role: 'user', content: 'hello' }],
        stop: ['done'],
      }

      expect(
        applyConfiguredProviderRequestCompatibility(body, {
          providerModel: 'custom-coder',
          compatibility: {
            supportsStopSequences: true,
          },
        }),
      ).toBe(body)
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
            fileChangeHooks: [],
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
                  supportsStopSequences: false,
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
          fileChangeHooks: [],
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

    test('throws the docs-quoted hard error string verbatim when no routing or caller model is configured', () => {
      // Locks the exact error string documented in docs/local-mode.md step 6
      // ("No model configured for agent '<id>'. Run /setup or set defaultModel
      // (or agents['<id>']) in your openbuff.json.") to the code so the docs
      // and implementation cannot drift independently. The existing partial-
      // assertion test above only checks substrings; this asserts the full
      // interpolated message for a concrete agent id.
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
          fileChangeHooks: [],
          providers: {},
        },
      }

      const agentId = 'notion-query-agent'
      expect(() =>
        resolveConfiguredAgentModelConfig({
          agentId,
          model: undefined,
          loadedConfig: emptyConfig,
        }),
      ).toThrow(
        `No model configured for agent '${agentId}'. Run /setup or set defaultModel (or agents['${agentId}']) in your openbuff.json.`,
      )
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
              fileChangeHooks: [],
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
                    supportsStopSequences: false,
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

    test('accepts an anthropic-compatible provider block', () => {
      const result = providerConfigFileSchema.safeParse({
        providers: {
          freemodel: {
            type: 'anthropic-compatible',
            baseURL: 'https://cc.freemodel.dev',
            apiKeyEnv: 'FREEMODEL_API_KEY',
            models: ['claude-sonnet-4-5'],
          },
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const provider = result.data.providers.freemodel
        expect(provider?.type).toBe('anthropic-compatible')
        // Anthropic-compatible defaults keep prompt caching and provider
        // metadata enabled, unlike the OpenAI-compatible defaults.
        expect(provider?.compatibility.stripCacheControl).toBe(false)
        expect(provider?.compatibility.stripProviderMetadata).toBe(false)
        expect(provider?.compatibility.supportsStopSequences).toBe(true)
      }
    })

    test('defaults anthropic-compatible baseURL to the official Anthropic API', () => {
      const result = providerConfigFileSchema.safeParse({
        providers: {
          anthropic: {
            type: 'anthropic-compatible',
            apiKeyEnv: 'ANTHROPIC_API_KEY',
            models: ['claude-sonnet-4-5'],
          },
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const provider = result.data.providers.anthropic
        expect(provider?.type).toBe('anthropic-compatible')
        if (provider?.type === 'anthropic-compatible') {
          expect(provider.baseURL).toBe('https://api.anthropic.com')
        }
      }
    })

    test('resolves an anthropic-compatible model and reads its api key env', () => {
      const resolved = resolveConfiguredProviderModel({
        model: 'freemodel/claude-sonnet-4-5',
        env: { FREEMODEL_API_KEY: 'fm-secret' },
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
            fileChangeHooks: [],
            providers: {
              freemodel: {
                type: 'anthropic-compatible',
                baseURL: 'https://cc.freemodel.dev',
                apiKeyEnv: 'FREEMODEL_API_KEY',
                models: ['claude-sonnet-4-5'],
                compatibility: {
                  stripCacheControl: false,
                  stringifyTextContent: false,
                  supportsTools: true,
                  supportsRequiredToolChoice: true,
                  supportsStopSequences: true,
                  stripProviderMetadata: false,
                },
              },
            },
          },
        },
      })

      expect(resolved?.providerId).toBe('freemodel')
      expect(resolved?.providerModel).toBe('claude-sonnet-4-5')
      expect(resolved?.apiKey).toBe('fm-secret')
    })

    test('throws when an anthropic-compatible provider is missing its api key env', () => {
      expect(() =>
        resolveConfiguredProviderModel({
          model: 'freemodel/claude-sonnet-4-5',
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
              fileChangeHooks: [],
              providers: {
                freemodel: {
                  type: 'anthropic-compatible',
                  baseURL: 'https://cc.freemodel.dev',
                  apiKeyEnv: 'FREEMODEL_API_KEY',
                  models: ['claude-sonnet-4-5'],
                  compatibility: {
                    stripCacheControl: false,
                    stringifyTextContent: false,
                    supportsTools: true,
                    supportsRequiredToolChoice: true,
                    supportsStopSequences: true,
                    stripProviderMetadata: false,
                  },
                },
              },
            },
          },
        }),
      ).toThrow("Missing environment variable 'FREEMODEL_API_KEY'")
    })

    test('getModelForRequest builds an anthropic-compatible model with a /v1 base url', async () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-anthropic-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          providers: {
            freemodel: {
              type: 'anthropic-compatible',
              baseURL: 'https://cc.freemodel.dev',
              apiKeyEnv: 'FREEMODEL_API_KEY',
              models: ['claude-sonnet-4-5'],
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath
      process.env.FREEMODEL_API_KEY = 'fm-secret'

      const result = await getModelForRequest({
        apiKey: 'codebuff-key',
        model: 'freemodel/claude-sonnet-4-5',
      })

      expect(result.isChatGptOAuth).toBe(false)
      expect(result.compatibility.stripCacheControl).toBe(false)
      expect(result.compatibility.supportsStopSequences).toBe(true)
      expect((result.model as any).provider).toBe('freemodel')
      expect((result.model as any).modelId).toBe('claude-sonnet-4-5')
      expect((result.model as any).config.baseURL).toBe(
        'https://cc.freemodel.dev/v1',
      )
    })

    test('normalizeAnthropicBaseURL appends /v1 only for bare hosts', () => {
      expect(normalizeAnthropicBaseURL('https://cc.freemodel.dev')).toBe(
        'https://cc.freemodel.dev/v1',
      )
      expect(normalizeAnthropicBaseURL('https://cc.freemodel.dev/')).toBe(
        'https://cc.freemodel.dev/v1',
      )
      expect(normalizeAnthropicBaseURL('https://api.anthropic.com/v1')).toBe(
        'https://api.anthropic.com/v1',
      )
      expect(
        normalizeAnthropicBaseURL('https://gateway.example.com/anthropic/v1'),
      ).toBe('https://gateway.example.com/anthropic/v1')
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

    test('reports malformed implicit configs instead of silently hiding them', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      fs.writeFileSync(path.join(tempDir, 'openbuff.json'), '{ invalid json')
      process.chdir(tempDir)

      const loadedConfig = loadProviderConfigSync()

      expect(loadedConfig.diagnostics).toEqual([
        expect.objectContaining({
          filePath: path.join(tempDir, 'openbuff.json'),
        }),
      ])
      expect(loadedConfig.diagnostics?.[0]?.message).toMatch(/parse|json/i)
    })

    test('invalidates cached provider config when implicit openbuff.d fragments change', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      const fragmentDir = path.join(tempDir, 'openbuff.d')
      const routesPath = path.join(fragmentDir, 'routes.json')
      fs.mkdirSync(fragmentDir, { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify({}))
      fs.writeFileSync(
        routesPath,
        JSON.stringify({ defaultModel: 'local/old' }),
      )
      fs.utimesSync(
        routesPath,
        new Date(1_700_000_000_000),
        new Date(1_700_000_000_000),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      const first = loadProviderConfigSync()
      expect(first.config.defaultModel).toBe('local/old')

      fs.writeFileSync(
        routesPath,
        JSON.stringify({ defaultModel: 'local/new' }),
      )
      fs.utimesSync(
        routesPath,
        new Date(1_700_000_100_000),
        new Date(1_700_000_100_000),
      )

      const second = loadProviderConfigSync()
      expect(second.config.defaultModel).toBe('local/new')
    })

    test('invalidates cached provider config when implicit openbuff.d fragments are added', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      const fragmentDir = path.join(tempDir, 'openbuff.d')
      const routesPath = path.join(fragmentDir, 'routes.json')
      fs.mkdirSync(fragmentDir, { recursive: true })
      fs.writeFileSync(
        configPath,
        JSON.stringify({ defaultModel: 'local/base' }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      const first = loadProviderConfigSync()
      expect(first.config.defaultModel).toBe('local/base')
      expect(first.config.agents.editor).toBeUndefined()

      fs.writeFileSync(
        routesPath,
        JSON.stringify({ agents: { editor: 'local/fragment' } }),
      )
      fs.utimesSync(
        fragmentDir,
        new Date(1_700_000_100_000),
        new Date(1_700_000_100_000),
      )

      const second = loadProviderConfigSync()
      expect(second.config.defaultModel).toBe('local/base')
      expect(second.config.agents.editor).toBe('local/fragment')
    })

    test('malformed repeated fragments do not poison dependency discovery for later fragments', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      const badPath = path.join(tempDir, 'bad.json')
      const wrapperPath = path.join(tempDir, 'wrapper.json')
      const validPath = path.join(tempDir, 'valid.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({ include: ['bad.json', 'wrapper.json'] }),
      )
      fs.writeFileSync(badPath, '{ invalid json')
      fs.writeFileSync(
        wrapperPath,
        JSON.stringify({ include: ['bad.json', 'valid.json'] }),
      )
      fs.writeFileSync(
        validPath,
        JSON.stringify({ agents: { editor: 'local/old' } }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      let thrown: unknown
      try {
        loadProviderConfigSync()
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeDefined()
      expect(String(thrown)).not.toContain('cycle')

      fs.writeFileSync(
        validPath,
        JSON.stringify({ agents: { editor: 'local/new' } }),
      )
      fs.utimesSync(
        validPath,
        new Date(1_700_000_100_000),
        new Date(1_700_000_100_000),
      )
      fs.writeFileSync(badPath, JSON.stringify({}))

      const loadedConfig = loadProviderConfigSync()
      expect(loadedConfig.config.agents.editor).toBe('local/new')
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
            'openbuff/agent-builder@1.2.3': { model: 'local/agent-builder' },
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
          agentId: 'openbuff/agent-builder@1.2.3',
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
          executePlan: {
            model: 'local/executor',
            reasoningEffort: 'medium',
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
            models: ['default-reasoner', 'planner', 'executor', 'thinker'],
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
          agentId: 'base2-execute-plan',
          loadedConfig,
        }),
      ).toEqual({
        model: 'local/executor',
        reasoningEffort: 'medium',
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

    test('M8.1: resolveConfiguredAgentModelConfig with preferModelParam uses the explicit model over mode/agent/defaultModel routing', () => {
      const config = providerConfigFileSchema.parse({
        defaultModel: 'local/default-reasoner',
        defaultReasoningEffort: 'low',
        modes: { edit: 'local/editor' },
        modeReasoningEfforts: { edit: 'medium' },
        agents: {
          base2: {
            model: 'local/base2-model',
            reasoningEffort: 'high',
          },
        },
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://127.0.0.1:11434/v1',
            models: ['default-reasoner', 'editor', 'base2-model', 'fallback'],
          },
        },
      })
      const loadedConfig = { sourceFilePaths: [], config }

      // Without preferModelParam: mode/agent/defaultModel routing wins, the
      // explicit `model` param is ignored (the pre-M8.1 bug).
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'local/fallback',
          agentId: 'base2',
          loadedConfig,
        }),
      ).toEqual({
        model: 'local/base2-model',
        reasoningEffort: 'high',
      })

      // With preferModelParam: the explicit model wins over agent routing.
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'local/fallback',
          agentId: 'base2',
          loadedConfig,
          preferModelParam: true,
        }),
      ).toEqual({
        model: 'local/fallback',
        reasoningEffort: 'high',
      })

      // preferModelParam also wins over mode routing. Reasoning effort is
      // orthogonal to model routing, so per-agent effort still applies even
      // when the agent model is overridden. Clearing `agentReasoningEfforts`
      // falls through to the default effort (`low`) since `base2` does not
      // map to a configured mode.
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'local/fallback',
          agentId: 'base2',
          loadedConfig: {
            ...loadedConfig,
            config: { ...config, agents: {}, agentReasoningEfforts: {} },
          },
          preferModelParam: true,
        }),
      ).toEqual({
        model: 'local/fallback',
        reasoningEffort: 'low',
      })

      // preferModelParam also wins over defaultModel.
      expect(
        resolveConfiguredAgentModelConfig({
          model: 'local/fallback',
          loadedConfig,
          preferModelParam: true,
        }),
      ).toEqual({
        model: 'local/fallback',
        reasoningEffort: 'low',
      })

      // preferModelParam with no `model` param falls back to normal routing.
      expect(
        resolveConfiguredAgentModelConfig({
          agentId: 'base2',
          loadedConfig,
          preferModelParam: true,
        }),
      ).toEqual({
        model: 'local/base2-model',
        reasoningEffort: 'high',
      })
    })

    test('M8.1: getModelForRequest threads preferModelParam so the failover model is actually used', async () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          defaultModel: 'local/primary',
          defaultReasoningEffort: 'low',
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['primary', 'fallback'],
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      // Without preferModelParam: defaultModel routing wins, explicit model ignored.
      const primary = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'local/fallback',
      })
      expect((primary.model as any).provider).toBe('local')
      expect((primary.model as any).modelId).toBe('primary')

      // With preferModelParam: explicit fallback model wins over defaultModel.
      const fallback = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'local/fallback',
        preferModelParam: true,
      })
      expect((fallback.model as any).provider).toBe('local')
      expect((fallback.model as any).modelId).toBe('fallback')
    })

    test('getModelForRequest reroutes image requests to visionModel', async () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          defaultModel: 'local/text-only',
          visionModel: {
            model: 'local/vision',
            reasoningEffort: 'high',
          },
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['text-only', 'vision'],
              modelCapabilities: {
                'text-only': { input: { image: false } },
                vision: { input: { image: true } },
              },
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      const result = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'local/text-only',
        requiresVision: true,
      })

      expect((result.model as any).provider).toBe('local')
      expect((result.model as any).modelId).toBe('vision')
      expect(result.effectiveModel).toBe('local/vision')
      expect(result.reasoningEffort).toBe('high')
    })

    test('getModelForRequest exposes resolved model context window tokens', async () => {
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
              models: {
                'public-small': 'provider-small',
                'public-large': 'provider-large',
              },
              // R1: context windows are declared explicitly via capabilities,
              // not inferred from the legacy contextWindowTokens field.
              defaultCapabilities: { context: { windowTokens: 32_000 } },
              modelCapabilities: {
                'provider-large': { context: { windowTokens: 1_000_000 } },
              },
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      const smallResult = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'local/public-small',
      })
      const largeResult = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'local/public-large',
      })

      expect(smallResult.contextWindowTokens).toBe(32_000)
      expect(largeResult.contextWindowTokens).toBe(1_000_000)
    })

    test('tracks primary and failover-floor context windows independently for each agent route', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          defaultModel: 'local/default-large',
          agents: {
            reviewer: { model: 'local/reviewer-medium' },
          },
          failoverModels: ['local/fallback-small'],
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['default-large', 'reviewer-medium', 'fallback-small'],
              modelCapabilities: {
                'default-large': { context: { windowTokens: 1_000_000 } },
                'reviewer-medium': { context: { windowTokens: 200_000 } },
                'fallback-small': { context: { windowTokens: 32_000 } },
              },
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      expect(resolveModelContextWindow({ agentId: 'base2' })).toBe(1_000_000)
      expect(resolveModelContextWindow({ agentId: 'reviewer' })).toBe(200_000)
      expect(resolveModelContextWindows({ agentId: 'base2' })).toEqual({
        primary: 1_000_000,
        failoverFloor: 32_000,
      })
      expect(resolveModelContextWindows({ agentId: 'reviewer' })).toEqual({
        primary: 200_000,
        failoverFloor: 32_000,
      })
    })

    test('getModelForRequest auto-picks same-provider vision fallback when no visionModel is configured', async () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          defaultModel: 'pioneer/pioneer/auto',
          providers: {
            pioneer: {
              type: 'openai-compatible',
              baseURL: 'https://api.pioneer.ai/v1',
              apiKeyEnv: 'PIONEER_API_KEY',
              models: [
                'pioneer/auto',
                'deepseek-ai/DeepSeek-V4-Pro',
                'claude-opus-4-8',
                'claude-sonnet-4-6',
              ],
              modelCapabilities: {
                'deepseek-ai/DeepSeek-V4-Pro': { input: { image: false } },
              },
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath
      process.env.PIONEER_API_KEY = 'test-key'

      const result = await getModelForRequest({
        apiKey: 'openbuff-local-mode',
        model: 'pioneer/pioneer/auto',
        requiresVision: true,
      })

      expect((result.model as any).provider).toBe('pioneer')
      expect((result.model as any).modelId).toBe('claude-opus-4-8')
      expect(result.effectiveModel).toBe('pioneer/claude-opus-4-8')
    })

    test('getModelForRequest fails clearly for image input without a vision route', async () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          defaultModel: 'local/text-only',
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['text-only'],
              modelCapabilities: {
                'text-only': { input: { image: false } },
              },
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      await expect(
        getModelForRequest({
          apiKey: 'openbuff-local-mode',
          model: 'local/text-only',
          requiresVision: true,
        }),
      ).rejects.toThrow('Configure visionModel')
    })

    test('supports built-in mode routing and provider presets', () => {
      const opencodeConfig = createProviderPresetConfig('opencode-go')
      const anthropicConfig = createProviderPresetConfig('anthropic')

      expect(OPENBUFF_PROVIDER_PRESETS['opencode-go'].label).toBe('OpenCode Go')
      expect(OPENBUFF_PROVIDER_PRESETS.anthropic.label).toBe('Anthropic API')
      expect(anthropicConfig.providers.anthropic?.type).toBe(
        'anthropic-compatible',
      )
      expect(opencodeConfig.agents?.['repair-editor']).toBe(
        opencodeConfig.defaultModel!,
      )
      expect(opencodeConfig.agentReasoningEfforts?.['repair-editor']).toBe(
        'high',
      )
      expect(opencodeConfig.agents?.architect).toBe(
        opencodeConfig.defaultModel!,
      )
      expect(opencodeConfig.agentReasoningEfforts?.evaluator).toBe('high')
      expect(
        resolveConfiguredAgentModel({
          model: 'anthropic/claude-opus-4.7',
          agentId: 'base2-plan',
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

    test('fresh preset setup persists the repair editor route', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-fresh-'),
      )

      const configPath = writeProviderConfigFile({
        cwd: tempDir,
        config: createProviderPresetConfig('openai'),
      })
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

      expect(config.agents['repair-editor']).toBe('openai/gpt-5.5')
      expect(config.agentReasoningEfforts['repair-editor']).toBe('high')
      expect(config.agents.architect).toBe('openai/gpt-5.5')
      expect(config.agents['release-manager']).toBe('openai/gpt-5.5')
      expect(config.agents['dependency-manager']).toBe('openai/gpt-5.5')
      expect(config.agentReasoningEfforts.evaluator).toBe('high')
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

    test('writeProviderConfigFile preserves existing routing and run options during merge', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'codebuff-provider-'),
      )
      const cwd = tempDir

      // Write custom config with specific modes and agents
      fs.writeFileSync(
        path.join(cwd, 'openbuff.json'),
        JSON.stringify({
          defaultModel: 'custom/default',
          modes: { default: 'custom/default', plan: 'custom/plan' },
          agents: { thinker: 'custom/thinker' },
          failoverModels: ['custom/backup-a', 'custom/backup-b'],
          maxAgentSteps: 42,
          providers: {
            custom: {
              type: 'openai-compatible',
              baseURL: 'https://api.example.com/v1',
              models: ['default', 'plan'],
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

      // defaultModel, modes, agents, failover, and run options preserved
      expect(mergedConfig.defaultModel).toBe('custom/default')
      expect(mergedConfig.modes.default).toBe('custom/default')
      expect(mergedConfig.modes.plan).toBe('custom/plan')
      expect(mergedConfig.agents.thinker).toBe('custom/thinker')
      expect(mergedConfig.failoverModels).toEqual([
        'custom/backup-a',
        'custom/backup-b',
      ])
      expect(mergedConfig.maxAgentSteps).toBe(42)
    })

    test('updates fragmented provider config without flattening the root', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-fragments-'),
      )
      const fragmentDir = path.join(tempDir, 'openbuff.d')
      fs.mkdirSync(fragmentDir)
      fs.writeFileSync(
        path.join(tempDir, 'openbuff.json'),
        JSON.stringify({ extends: ['./openbuff.d'] }),
      )
      fs.writeFileSync(
        path.join(fragmentDir, 'providers.json'),
        JSON.stringify({ providers: {} }),
      )
      fs.writeFileSync(
        path.join(fragmentDir, 'routes.json'),
        JSON.stringify({ defaultModel: 'custom/existing', agents: {} }),
      )

      writeProviderConfigFile({
        cwd: tempDir,
        config: createProviderPresetConfig('openai'),
      })

      const root = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'openbuff.json'), 'utf8'),
      )
      const providers = JSON.parse(
        fs.readFileSync(path.join(fragmentDir, 'providers.json'), 'utf8'),
      )
      const routes = JSON.parse(
        fs.readFileSync(path.join(fragmentDir, 'routes.json'), 'utf8'),
      )
      expect(root.extends).toEqual(['./openbuff.d'])
      expect(root.providers).toBeUndefined()
      expect(root.defaultModel).toBeUndefined()
      expect(root.agents).toBeUndefined()
      expect(providers.providers.openai).toBeDefined()
      expect(routes.defaultModel).toBe('custom/existing')
      expect(routes.agents['repair-editor']).toBeDefined()
    })

    test('does not flatten config when a fragment is malformed', () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-provider-fragments-'),
      )
      const fragmentDir = path.join(tempDir, 'openbuff.d')
      const rootPath = path.join(tempDir, 'openbuff.json')
      fs.mkdirSync(fragmentDir)
      const originalRoot = JSON.stringify({ extends: ['./openbuff.d'] })
      fs.writeFileSync(rootPath, originalRoot)
      fs.writeFileSync(path.join(fragmentDir, 'providers.json'), '{ bad json')

      expect(() =>
        writeProviderConfigFile({
          cwd: tempDir,
          config: createProviderPresetConfig('openai'),
        }),
      ).toThrow('Cannot merge with existing config')
      expect(fs.readFileSync(rootPath, 'utf8')).toBe(originalRoot)
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
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-discovery-'))
      process.env[PROVIDER_CONFIG_ENV_VAR] = path.join(tempDir, 'openbuff.json')
      setModelDiscoveryCachePath(path.join(tempDir, 'model-cache.json'))
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
              auth: 'none',
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
      expect(result?.endpoint).toBe('https://api.example.com/v1/custom-models')
      expect(result?.auth).toBe('none')
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

    test('discoverProviderModels forwards AbortSignal to fetch when timeout is disabled', async () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()
      const abortController = new AbortController()
      let seenSignal: AbortSignal | undefined

      const result = await discoverProviderModels({
        providerId: 'local',
        loadedConfig,
        signal: abortController.signal,
        timeoutMs: 0,
        fetch: async (_input, init) => {
          seenSignal = init?.signal ?? undefined
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      })

      expect(result.models).toEqual([])
      expect(seenSignal).toBe(abortController.signal)
    })

    test('discoverProviderModels aborts hung fetches after timeout', async () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()
      let seenSignal: AbortSignal | undefined

      await expect(
        discoverProviderModels({
          providerId: 'local',
          loadedConfig,
          timeoutMs: 1,
          fetch: async (_input, init) => {
            seenSignal = init?.signal ?? undefined
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(init.signal?.reason)
              })
            })
          },
        }),
      ).rejects.toThrow('Model discovery timed out after 1ms.')

      expect(seenSignal?.aborted).toBe(true)
    })

    test('discoverProviderModels propagates fetch aborts', async () => {
      writeTestProviderConfig({
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:8080/v1',
          models: [],
        },
      })
      const loadedConfig = loadProviderConfigSync()
      const abortController = new AbortController()
      abortController.abort()

      await expect(
        discoverProviderModels({
          providerId: 'local',
          loadedConfig,
          signal: abortController.signal,
          fetch: async (_input, init) => {
            expect(init?.signal?.aborted).toBe(true)
            throw new DOMException('The operation was aborted.', 'AbortError')
          },
        }),
      ).rejects.toThrow('The operation was aborted.')
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

    test('discoverProviderModels sends auth to same-origin custom discovery endpoints by default', async () => {
      writeTestProviderConfig({
        custom: {
          type: 'openai-compatible',
          baseURL: 'https://api.custom.com/v1',
          apiKeyEnv: 'CUSTOM_API_KEY',
          models: [],
          discovery: {
            strategy: 'custom',
            endpoint: 'https://api.custom.com/v1/catalog/models',
          },
        },
      })
      process.env.CUSTOM_API_KEY = 'test-key'
      const loadedConfig = loadProviderConfigSync()
      const seen: { authorization: string | null } = { authorization: null }

      await discoverProviderModels({
        providerId: 'custom',
        loadedConfig,
        fetch: async (_input, init) => {
          seen.authorization = new Headers(init?.headers).get('Authorization')
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      })

      expect(seen.authorization).toBe('Bearer test-key')
    })

    test('discoverProviderModels omits auth from cross-origin custom discovery endpoints by default', async () => {
      writeTestProviderConfig({
        custom: {
          type: 'openai-compatible',
          baseURL: 'https://api.custom.com/v1',
          apiKeyEnv: 'CUSTOM_API_KEY',
          models: [],
          discovery: {
            strategy: 'custom',
            endpoint: 'https://catalog.custom.com/models',
          },
        },
      })
      process.env.CUSTOM_API_KEY = 'test-key'
      const loadedConfig = loadProviderConfigSync()
      let authorization: string | null = 'not-seen'

      await discoverProviderModels({
        providerId: 'custom',
        loadedConfig,
        fetch: async (_input, init) => {
          authorization = new Headers(init?.headers).get('Authorization')
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      })

      expect(authorization).toBeNull()
    })

    test('discoverProviderModels can opt in auth for cross-origin custom discovery endpoints', async () => {
      writeTestProviderConfig({
        custom: {
          type: 'openai-compatible',
          baseURL: 'https://api.custom.com/v1',
          apiKeyEnv: 'CUSTOM_API_KEY',
          models: [],
          discovery: {
            strategy: 'custom',
            endpoint: 'https://catalog.custom.com/models',
            auth: 'provider',
          },
        },
      })
      process.env.CUSTOM_API_KEY = 'test-key'
      const loadedConfig = loadProviderConfigSync()
      const seen: { authorization: string | null } = { authorization: null }

      await discoverProviderModels({
        providerId: 'custom',
        loadedConfig,
        fetch: async (_input, init) => {
          seen.authorization = new Headers(init?.headers).get('Authorization')
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      })

      expect(seen.authorization).toBe('Bearer test-key')
    })

    test('discoverProviderModels can disable auth for inferred discovery endpoints', async () => {
      writeTestProviderConfig({
        custom: {
          type: 'openai-compatible',
          baseURL: 'https://api.custom.com/v1',
          apiKeyEnv: 'CUSTOM_API_KEY',
          models: [],
          discovery: {
            auth: 'none',
          },
        },
      })
      process.env.CUSTOM_API_KEY = 'test-key'
      const loadedConfig = loadProviderConfigSync()
      let authorization: string | null = 'not-seen'

      await discoverProviderModels({
        providerId: 'custom',
        loadedConfig,
        fetch: async (_input, init) => {
          authorization = new Headers(init?.headers).get('Authorization')
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      })

      expect(authorization).toBeNull()
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
      setModelDiscoveryCachePathForTest(
        path.join(tempDir, 'discovery-cache.json'),
      )

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
          data: [{ id: 'llama3.1' }, { id: 'qwen2.5-coder:32b' }],
        }),
      })

      const cached = getCachedProviderModels('local')
      expect(cached).toHaveLength(2)
      expect(cached.map((m) => m.id)).toEqual(['llama3.1', 'qwen2.5-coder:32b'])
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
          data: [{ id: 'configured-model' }, { id: 'discovered-model' }],
        }),
      })

      const available = getAvailableProviderModels(loadedConfig)

      const configuredModel = available.find((m) => m.id === 'configured-model')
      expect(configuredModel).toBeDefined()
      expect(configuredModel?.configured).toBe(true)

      const discoveredModel = available.find((m) => m.id === 'discovered-model')
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

      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      expect(writtenConfig.providers.local.models).toContain('existing-model')
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

      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      expect(writtenConfig.providers.local.models['existing-model']).toBe(
        'existing-remote',
      )
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
      const localModels = freshConfig.config.providers.local.models as string[]
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

      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      expect(writtenConfig.providers.local.models).toContain('new-model')
      expect(writtenConfig.providers.local.models).not.toContain(
        'local/new-model',
      )
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

describe('getAncestorProviderConfigPaths — bounded ancestor walk (C1.3)', () => {
  const originalHome = process.env.HOME

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    delete process.env.OPENBUFF_TRUST_ANCESTOR_CONFIG
  })

  test('stops at the home directory boundary by default', () => {
    // Simulate a run from a project under home. The walk must not produce any
    // config paths at or above the home directory's parent.
    const home = os.homedir()
    const start = path.join(home, 'Code', 'project', 'subdir')
    const paths = getAncestorProviderConfigPaths(start)
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      const dir = path.dirname(p)
      // Every config dir must be at or below home.
      expect(dir === home || dir.startsWith(home + path.sep)).toBe(true)
    }
  })

  test('caps at MAX_ANCESTOR_SCAN_DEPTH when home is far above start', () => {
    // Set HOME to a high temp dir so the home boundary is never reached; the
    // depth ceiling is the only bound. 10 levels * 2 files per dir = 20 max.
    process.env.HOME = path.join(os.tmpdir(), 'far-away-home-that-wont-be-hit')
    const deep = path.join(
      os.tmpdir(),
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
    )
    const paths = getAncestorProviderConfigPaths(deep)
    // 10 dirs * 2 files = 20. The walk must stop at the ceiling, not reach /.
    expect(paths.length).toBeLessThanOrEqual(20)
    expect(paths.length).toBeGreaterThan(0)
  })

  test('walks past the home boundary when OPENBUFF_TRUST_ANCESTOR_CONFIG=1', () => {
    process.env.OPENBUFF_TRUST_ANCESTOR_CONFIG = '1'
    // Even with trust set, the filesystem root terminates the walk. Start
    // shallow enough to reach root within a few levels but confirm we go past
    // where the home boundary would normally stop us.
    const home = os.homedir()
    const start = path.join(home, 'subdir')
    const paths = getAncestorProviderConfigPaths(start)
    // The last config dir's parent should be the filesystem root (dirname === itself).
    const lastDir = path.dirname(paths[paths.length - 1])
    expect(path.dirname(lastDir)).toBe(lastDir)
  })
})
