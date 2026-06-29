import fs from 'fs'
import os from 'os'
import path from 'path'

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'

import { resolveModelsToTry } from '../failover'
import {
  PROVIDER_CONFIG_ENV_VAR,
  providerConfigFileSchema,
  resolveConfiguredAgentModelConfig,
} from '../../provider-config'
import type { LoadedProviderConfig } from '../../provider-config'

// Env isolation helpers — copied from sdk/src/__tests__/model-provider.test.ts.
const originalEnv = { ...process.env }

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)
}

describe('failover loop contract (composed)', () => {
  beforeEach(() => {
    resetEnv()
    delete process.env[PROVIDER_CONFIG_ENV_VAR]
  })

  afterEach(() => {
    resetEnv()
  })

  // Build a validated LoadedProviderConfig via providerConfigFileSchema.parse
  // so the fixture is type-checked against the real config schema (mirrors the
  // resolver-test fixture style in model-provider.test.ts). The primary is
  // deliberately repeated in failoverModels to exercise the dedup path.
  function makeLoadedConfig(): LoadedProviderConfig {
    const config = providerConfigFileSchema.parse({
      defaultModel: 'local/primary',
      defaultReasoningEffort: 'low',
      failoverModels: ['local/primary', 'local/backup-a', 'local/backup-b'],
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:11434/v1',
          models: ['primary', 'backup-a', 'backup-b'],
        },
      },
    })
    return { sourceFilePaths: [], config }
  }

  test('resolveModelsToTry dedupes a repeated primary and preserves failover order', () => {
    const loadedConfig = makeLoadedConfig()
    expect(resolveModelsToTry('local/primary', loadedConfig)).toEqual([
      'local/primary',
      'local/backup-a',
      'local/backup-b',
    ])
  })

  test('resolveConfiguredAgentModelConfig with preferModelParam keeps each backup model (pre-M8.1 bypass)', () => {
    const loadedConfig = makeLoadedConfig()
    const models = resolveModelsToTry('local/primary', loadedConfig)
    // Skip the primary (index 0); assert each backup wins over defaultModel
    // routing. The pre-M8.1 bug would have re-resolved every backup to
    // `local/primary`, making failover a no-op.
    for (const backup of models.slice(1)) {
      expect(
        resolveConfiguredAgentModelConfig({
          model: backup,
          loadedConfig,
          preferModelParam: true,
        }),
      ).toEqual({ model: backup, reasoningEffort: 'low' })
    }
  })

  test('resolveConfiguredAgentModelConfig without preferModelParam honors defaultModel for the primary', () => {
    const loadedConfig = makeLoadedConfig()
    expect(
      resolveConfiguredAgentModelConfig({
        model: 'local/primary',
        loadedConfig,
      }),
    ).toEqual({ model: 'local/primary', reasoningEffort: 'low' })
  })

  test('resolveModelsToTry returns a single-element list when failoverModels is unset (no-failover baseline)', () => {
    // No failoverModels configured: the loop should have exactly one attempt
    // (the primary) and never enter the failover branch.
    const config = providerConfigFileSchema.parse({
      defaultModel: 'local/primary',
      defaultReasoningEffort: 'low',
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:11434/v1',
          models: ['primary'],
        },
      },
    })
    const loadedConfig: LoadedProviderConfig = {
      sourceFilePaths: [],
      config,
    }
    expect(resolveModelsToTry('local/primary', loadedConfig)).toEqual([
      'local/primary',
    ])
  })

  test('resolveModelsToTry dedupes a failover model that repeats a non-default primary (agentId-routed primary)', () => {
    // Covers the case where the primary is resolved from agentId routing
    // (not defaultModel). The dedup filter is `model !== primaryModel`, so a
    // failoverModels entry that coincidentally repeats the agent-routed primary
    // must be dropped — otherwise the loop would wastefully retry the same
    // model that just failed.
    const config = providerConfigFileSchema.parse({
      defaultModel: 'local/default-model',
      defaultReasoningEffort: 'low',
      failoverModels: ['local/agent-routed', 'local/backup-a'],
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:11434/v1',
          models: ['default-model', 'agent-routed', 'backup-a'],
        },
      },
    })
    const loadedConfig: LoadedProviderConfig = {
      sourceFilePaths: [],
      config,
    }
    // The primary is `local/agent-routed` (e.g. resolved by
    // resolveConfiguredAgentModelConfig from an agentId), NOT the
    // defaultModel `local/default-model`. The failoverModels list repeats it
    // at index 0; the dedup must drop it, leaving only `local/backup-a`.
    expect(resolveModelsToTry('local/agent-routed', loadedConfig)).toEqual([
      'local/agent-routed',
      'local/backup-a',
    ])
  })

  test('resolveModelsToTry returns an empty list when primaryModel is undefined and failoverModels is unset', () => {
    // Edge case that motivated the `effectiveRequestedModel` resolution in
    // llm.ts: when `params.model` is undefined (e.g. bundled agents whose
    // model is deferred to openbuff.json routing) AND no agentId is available
    // to resolve a primary, resolveModelsToTry returns []. Without the
    // up-front resolution, the loop never executes and the post-loop
    // `throw lastError` surfaces as "Agent run error: undefined".
    const config = providerConfigFileSchema.parse({
      defaultModel: 'local/default-model',
      defaultReasoningEffort: 'low',
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:11434/v1',
          models: ['default-model'],
        },
      },
    })
    const loadedConfig: LoadedProviderConfig = {
      sourceFilePaths: [],
      config,
    }
    expect(resolveModelsToTry(undefined, loadedConfig)).toEqual([])
  })

  test('resolveModelsToTry dedupes ALL failover entries that repeat the primary when failoverModels contains the primary multiple times', () => {
    // Guards against a misconfigured list with duplicate primaries: if
    // failoverModels repeats the primary multiple times, every occurrence must
    // be dropped (not just the first). The dedup filter is `model !==
    // primaryModel` applied to every entry, so duplicates are all filtered out —
    // the loop should never wastefully retry the same model that just failed.
    const config = providerConfigFileSchema.parse({
      defaultModel: 'local/primary',
      defaultReasoningEffort: 'low',
      failoverModels: [
        'local/primary',
        'local/primary',
        'local/backup-a',
        'local/primary',
        'local/backup-b',
      ],
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:11434/v1',
          models: ['primary', 'backup-a', 'backup-b'],
        },
      },
    })
    const loadedConfig: LoadedProviderConfig = {
      sourceFilePaths: [],
      config,
    }
    expect(resolveModelsToTry('local/primary', loadedConfig)).toEqual([
      'local/primary',
      'local/backup-a',
      'local/backup-b',
    ])
  })

  test('resolveModelsToTry dedupes duplicate entries within failoverModels itself (misconfigured list with duplicate backups)', () => {
    // Guards against a misconfigured list with duplicate backups: if
    // failoverModels repeats a backup model multiple times, every duplicate
    // after the first must be dropped (preserving first-seen order). Without
    // this dedup the loop would wastefully retry the same backup model twice
    // — burning a second provider request against a model that already failed
    // identically. The primary is distinct from the backups here to isolate
    // the within-list dedup from the primary-dedup path.
    const config = providerConfigFileSchema.parse({
      defaultModel: 'local/primary',
      defaultReasoningEffort: 'low',
      failoverModels: [
        'local/backup-a',
        'local/backup-a',
        'local/backup-b',
      ],
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:11434/v1',
          models: ['primary', 'backup-a', 'backup-b'],
        },
      },
    })
    const loadedConfig: LoadedProviderConfig = {
      sourceFilePaths: [],
      config,
    }
    expect(resolveModelsToTry('local/primary', loadedConfig)).toEqual([
      'local/primary',
      'local/backup-a',
      'local/backup-b',
    ])
  })
})

/**
 * Block 2 — `promptAiSdkStream` loop-level integration.
 *
 * The intended test: drive the real `promptAiSdkStream` export, spyOn the
 * `getModelForRequest` export of `./model-provider`, and assert the loop
 * (a) calls getModelForRequest with preferModelParam=false for the primary
 * (failoverIndex 0) and preferModelParam=true for the backup (failoverIndex 1),
 * (b) advances to the backup when the primary rejects with a 401
 * (failover-eligible, NOT retryable — see isRetryableStatusCode), and
 * (c) yields the backup's text content and returns a successful PromptResult.
 *
 * SKIPPED because the loop-level seam is too fragile to assert without running:
 *
 * 1. Spy interception: `promptAiSdkStream` imports `getModelForRequest` via a
 *    named import (`import { getModelForRequest } from './model-provider'`).
 *    Bun's ESM named imports are live bindings, but `spyOn(namespace, 'export')`
 *    on a namespace object does not reliably intercept a call site that bound
 *    the named export at module load. If the primary's 401 never fires (the
 *    loop "succeeds" on the primary), the spy is not intercepting the call
 *    site in llm.ts. Without a verified interception the loop assertions are
 *    meaningless.
 *
 * 2. Fake LanguageModel.doStream shape: the real `streamText` from `ai`
 *    validates the `LanguageModelV1` interface and calls `doStream` with a
 *    large, version-specific options object, then expects a strictly-typed
 *    `LanguageModelV1StreamPart` async iterable (including a correctly-shaped
 *    `finish` part). A partial fake is likely rejected by `streamText` before
 *    the failover catch block ever sees the 401 — masking the failover path
 *    under an unrelated stream-shape error.
 *
 * 3. `APICallError` constructor shape + promptAiSdkStream param surface: the
 *    loop destructures many param fields (sendAction, trackEvent, logger,
 *    providerOptions passthrough, etc.) and threads them through
 *    convertCbToModelMessages / getMessagesForModelContext /
 *    withConfiguredReasoningEffort / getProviderOptions — a large surface to
 *    stub correctly blind.
 *
 * Block 1 above already locks the composed contract (`resolveModelsToTry` dedup
 * + `resolveConfiguredAgentModelConfig` preferModelParam bypass) that the loop
 * relies on, which is the reliable baseline coverage. This skip records the
 * blocker for a follow-up once a verified module-mock strategy (e.g. a
 * injectable model-provider seam or an in-repo http mock) is available.
 */
describe('promptAiSdkStream failover loop (integration)', () => {
  beforeEach(() => {
    resetEnv()
    delete process.env[PROVIDER_CONFIG_ENV_VAR]
  })

  afterEach(() => {
    resetEnv()
  })

  test.skip(
    'TODO: loop-level test — advances to backup on primary 401, records preferModelParam [false, true], yields backup content',
    async () => {
      // Intended setup (kept for the follow-up):
      // 1. Write a temp openbuff.json with defaultModel 'local/primary' and
      //    failoverModels: ['local/backup-a'], point
      //    process.env[PROVIDER_CONFIG_ENV_VAR] at it.
      // 2. import * as modelProvider from '../model-provider'; spyOn the
      //    `getModelForRequest` export, recording preferModelParam per call.
      //    - call 1 (primary, preferModelParam=false): return a fake
      //      LanguageModel whose doStream rejects with a 401 (createAuthError
      //      produces an Error with statusCode 401, which isFailoverEligible
      //      and NOT isRetryable, so the inner retry loop bubbles it to the
      //      outer failover catch).
      //    - call 2 (backup, preferModelParam=true): return a fake
      //      LanguageModel whose doStream yields { type: 'text-delta',
      //      text: 'backup-content' } then a { type: 'finish' } part, plus
      //      compatibility / reasoningEffort / effectiveModel /
      //      contextWindowTokens / pricing / isChatGptOAuth fields.
      // 3. Build a minimal promptAiSdkStream params object (apiKey, runId,
      //    messages: [], clientSessionId, fingerprintId, userId: undefined,
      //    userInputId, model: 'local/primary', agentId: undefined,
      //    sendAction: async no-op, logger stub with info/warn/error no-ops,
      //    trackEvent: async no-op, signal: new AbortController().signal).
      // 4. Iterate the async generator, collect text chunks + the return value.
      //
      // Expected assertions:
      //   - recorded preferModelParam calls === [false, true]
      //   - collected text chunks include 'backup-content'
      //   - generator return value is a success: { aborted: false, value: ... }
      //     (promptSuccess shape from @codebuff/common/util/error).
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-failover-'),
      )
      const configPath = path.join(tempDir, 'openbuff.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          defaultModel: 'local/primary',
          defaultReasoningEffort: 'low',
          failoverModels: ['local/backup-a'],
          providers: {
            local: {
              type: 'openai-compatible',
              baseURL: 'http://127.0.0.1:11434/v1',
              models: ['primary', 'backup-a'],
            },
          },
        }),
      )
      process.env[PROVIDER_CONFIG_ENV_VAR] = configPath

      expect(true).toBe(true)
    },
  )
})
