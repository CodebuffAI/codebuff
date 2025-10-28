import type { OpenRouterProviderSettings } from './provider'
import type {
  OpenRouterChatModelId,
  OpenRouterChatSettings,
} from './types/openrouter-chat-settings'
import type {
  OpenRouterCompletionModelId,
  OpenRouterCompletionSettings,
} from './types/openrouter-completion-settings'

import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils'
import { OpenRouterChatLanguageModel } from './chat'
import { OpenRouterCompletionLanguageModel } from './completion'

/**
@deprecated Use `createOpenRouter` instead.
 */
export class OpenRouter {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://openrouter.ai/api/v1`.
   */
  readonly baseURL: string

  /**
API key that is being sent using the `Authorization` header.
It defaults to the `OPENROUTER_API_KEY` environment variable.
 */
  readonly apiKey?: string

  /**
Custom headers to include in the requests.
   */
  readonly headers?: Record<string, string>

  /**
   * Creates a new OpenRouter provider instance.
   */
  constructor(options: OpenRouterProviderSettings = {}) {
    this.baseURL =
      withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
      'https://openrouter.ai/api/v1'
    this.apiKey = options.apiKey
    this.headers = options.headers
  }

  private get baseConfig() {
    return {
      baseURL: this.baseURL,
      headers: () => ({
        Authorization: `Bearer ${loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'OPENROUTER_API_KEY',
          description: 'OpenRouter',
        })}`,
        ...this.headers,
      }),
    }
  }

  chat(modelId: OpenRouterChatModelId, settings: OpenRouterChatSettings = {}) {
    return new OpenRouterChatLanguageModel(modelId, settings, {
      provider: 'openrouter.chat',
      ...this.baseConfig,
      compatibility: 'strict',
      url: ({ path }) => `${this.baseURL}${path}`,
    })
  }

  completion(
    modelId: OpenRouterCompletionModelId,
    settings: OpenRouterCompletionSettings = {},
  ) {
    return new OpenRouterCompletionLanguageModel(modelId, settings, {
      provider: 'openrouter.completion',
      ...this.baseConfig,
      compatibility: 'strict',
      url: ({ path }) => `${this.baseURL}${path}`,
    })
  }
}
