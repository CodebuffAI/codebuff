import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import {
  finetunedVertexModels,
  geminiModels,
  openaiModels,
} from '@codebuff/common/old-constants'
import {
  endToolTag,
  startToolTag,
  toolNameParam,
} from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { convertCbToModelMessages } from '@codebuff/common/util/messages'
import { errorToObject } from '@codebuff/common/util/object'
import { withTimeout } from '@codebuff/common/util/promise'
import { generateCompactId } from '@codebuff/common/util/string'
import { APICallError, generateObject, generateText, streamText } from 'ai'

import { checkLiveUserInput, getLiveUserInputIds } from '../../live-user-inputs'
import { logger } from '../../util/logger'
import { saveMessage } from '../message-cost-tracker'
import { openRouterLanguageModel } from '../openrouter'
import { systemPromptCache, responseCache } from '../prompt-cache'
import { vertexFinetuned } from './vertex-finetuned'

import type {
  GeminiModel,
  Model,
  OpenAIModel,
} from '@codebuff/common/old-constants'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  OpenRouterProviderOptions,
  OpenRouterUsageAccounting,
} from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import type { z } from 'zod/v4'

// Cost optimization: Task-based parameter optimization
interface TaskBasedParameters {
  temperature: number
  maxTokens: number
}

type TaskType = 'file-operations' | 'simple-query' | 'code-generation' | 'analysis' | 'creative' | 'complex-reasoning' | 'default'

const getOptimalParametersByTask = (taskType: TaskType): TaskBasedParameters => {
  const paramConfigs: Record<TaskType, TaskBasedParameters> = {
    'file-operations': { temperature: 0.0, maxTokens: 1000 },      // Deterministic file ops
    'simple-query': { temperature: 0.0, maxTokens: 500 },         // Quick factual responses  
    'code-generation': { temperature: 0.1, maxTokens: 2000 },     // Consistent code output
    'analysis': { temperature: 0.3, maxTokens: 1500 },            // Balanced analysis
    'creative': { temperature: 0.8, maxTokens: 4000 },            // High creativity
    'complex-reasoning': { temperature: 0.4, maxTokens: 3000 },   // Deep thinking
    'default': { temperature: 0.3, maxTokens: 2000 }              // Balanced default
  }
  
  return paramConfigs[taskType] || paramConfigs['default']
}

const detectTaskTypeFromMessages = (messages: Message[]): TaskType => {
  const lastMessage = messages[messages.length - 1]
  const content = typeof lastMessage?.content === 'string' 
    ? lastMessage.content.toLowerCase() 
    : JSON.stringify(lastMessage?.content || '').toLowerCase()
  
  // Tool-based detection
  if (content.includes('write_file') || content.includes('str_replace') || content.includes('read_files')) {
    return 'file-operations'
  }
  if (content.includes('run_terminal_command') || content.includes('browser_logs')) {
    return 'file-operations'
  }
  if (content.includes('spawn_agents') || content.includes('think_deeply')) {
    return 'complex-reasoning'
  }
  if (content.includes('code_search') || content.includes('create_plan')) {
    return 'analysis'
  }
  
  // Content-based detection
  if (content.length < 100) {
    return 'simple-query'
  }
  if (content.includes('write') && (content.includes('code') || content.includes('function') || content.includes('class'))) {
    return 'code-generation'
  }
  if (content.includes('analyze') || content.includes('explain') || content.includes('review')) {
    return 'analysis'
  }
  if (content.includes('creative') || content.includes('story') || content.includes('poem')) {
    return 'creative'
  }
  if (content.includes('complex') || content.includes('architecture') || content.includes('design')) {
    return 'complex-reasoning'
  }
  
  return 'default'
}

// Cost optimization: Cache system prompts and common responses
const isCacheableSystemPrompt = (messages: Message[]): boolean => {
  // Cache system prompts (first message is usually system)
  if (messages.length > 0 && messages[0].role === 'system') {
    const content = typeof messages[0].content === 'string' 
      ? messages[0].content 
      : JSON.stringify(messages[0].content || '')
    
    // Cache if it's a system prompt > 500 chars (likely to be reused)
    return content.length > 500
  }
  return false
}

const generateCacheKey = (messages: Message[], model: string, options: any): string => {
  // Create cache key from messages + model + key parameters
  const cacheableContent = {
    messages: messages.slice(0, 2), // Only first 2 messages (system + first user)
    model,
    temperature: (options as any).temperature,
    maxTokens: (options as any).maxTokens
  }
  return JSON.stringify(cacheableContent)
}

// TODO: We'll want to add all our models here!
const modelToAiSDKModel = (model: Model): LanguageModel => {
  if (
    Object.values(finetunedVertexModels as Record<string, string>).includes(
      model,
    )
  ) {
    return vertexFinetuned(model)
  }
  if (Object.values(geminiModels).includes(model as GeminiModel)) {
    return google.languageModel(model)
  }
  if (model === openaiModels.o3pro || model === openaiModels.o3) {
    return openai.responses(model)
  }
  if (Object.values(openaiModels).includes(model as OpenAIModel)) {
    return openai.languageModel(model)
  }
  // All other models go through OpenRouter
  return openRouterLanguageModel(model)
}

// TODO: Add retries & fallbacks: likely by allowing this to instead of "model"
// also take an array of form [{model: Model, retries: number}, {model: Model, retries: number}...]
// eg: [{model: "gemini-2.0-flash-001"}, {model: "vertex/gemini-2.0-flash-001"}, {model: "claude-3-5-haiku", retries: 3}]
export const promptAiSdkStream = async function* (
  options: {
    messages: Message[]
    clientSessionId: string
    fingerprintId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
    thinkingBudget?: number
    userInputId: string
    agentId?: string
    maxRetries?: number
    onCostCalculated?: (credits: number) => Promise<void>
    includeCacheControl?: boolean
    resolveMessageId?: (messageId: string) => unknown
  } & Omit<Parameters<typeof streamText>[0], 'model' | 'messages'>,
) {
  if (
    !checkLiveUserInput(
      options.userId,
      options.userInputId,
      options.clientSessionId,
    )
  ) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping stream due to canceled user input',
    )
    yield ''
    return
  }
  const startTime = Date.now()

  let aiSDKModel = modelToAiSDKModel(options.model)

  // Cost optimization: Apply task-based parameter optimization
  const taskType = detectTaskTypeFromMessages(options.messages)
  const optimalParams = getOptimalParametersByTask(taskType)
  
  // Only override if not explicitly set by caller
  const finalOptions = {
    ...options,
    temperature: (options as any).temperature ?? optimalParams.temperature,
    maxTokens: (options as any).maxTokens ?? optimalParams.maxTokens,
  }

  const response = streamText({
    ...finalOptions,
    model: aiSDKModel,
    maxRetries: options.maxRetries,
    messages: convertCbToModelMessages(options),
  })

  let content = ''
  let reasoning = false

  for await (const chunk of response.fullStream) {
    if (chunk.type === 'error') {
      logger.error(
        {
          chunk: { ...chunk, error: undefined },
          error: errorToObject(chunk.error),
          model: options.model,
        },
        'Error from AI SDK',
      )

      const errorBody = APICallError.isInstance(chunk.error)
        ? chunk.error.responseBody
        : undefined
      const mainErrorMessage =
        chunk.error instanceof Error
          ? chunk.error.message
          : typeof chunk.error === 'string'
            ? chunk.error
            : JSON.stringify(chunk.error)
      const errorMessage = `Error from AI SDK (model ${options.model}): ${buildArray([mainErrorMessage, errorBody]).join('\n')}`
      throw new Error(errorMessage, {
        cause: chunk.error,
      })
    }
    if (chunk.type === 'reasoning-delta') {
      if (
        (
          options.providerOptions?.openrouter as
            | OpenRouterProviderOptions
            | undefined
        )?.reasoning?.exclude
      ) {
        continue
      }
      if (!reasoning) {
        reasoning = true
        yield `${startToolTag}{
  ${JSON.stringify(toolNameParam)}: "think_deeply",
  "thought": "`
      }
      yield JSON.stringify(chunk.text).slice(1, -1)
    }
    if (chunk.type === 'text-delta') {
      if (reasoning) {
        reasoning = false
        yield `"\n}${endToolTag}\n\n`
      }
      content += chunk.text
      yield chunk.text
    }
  }

  const messageId = (await response.response).id
  if (options.resolveMessageId) {
    options.resolveMessageId(messageId)
  }

  const providerMetadata = (await response.providerMetadata) ?? {}
  const usage = await response.usage
  let inputTokens = usage.inputTokens || 0
  const outputTokens = usage.outputTokens || 0
  let cacheReadInputTokens: number = 0
  let cacheCreationInputTokens: number = 0
  let costOverrideDollars: number | undefined
  if (providerMetadata.anthropic) {
    cacheReadInputTokens =
      typeof providerMetadata.anthropic.cacheReadInputTokens === 'number'
        ? providerMetadata.anthropic.cacheReadInputTokens
        : 0
    cacheCreationInputTokens =
      typeof providerMetadata.anthropic.cacheCreationInputTokens === 'number'
        ? providerMetadata.anthropic.cacheCreationInputTokens
        : 0
  }
  if (providerMetadata.openrouter) {
    if (providerMetadata.openrouter.usage) {
      const openrouterUsage = providerMetadata.openrouter
        .usage as OpenRouterUsageAccounting
      cacheReadInputTokens =
        openrouterUsage.promptTokensDetails?.cachedTokens ?? 0
      inputTokens = openrouterUsage.promptTokens - cacheReadInputTokens

      costOverrideDollars =
        (openrouterUsage.cost ?? 0) +
        (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
    }
  }

  const creditsUsedPromise = saveMessage({
    messageId,
    userId: options.userId,
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    model: options.model,
    request: options.messages,
    response: content,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: options.chargeUser ?? true,
    costOverrideDollars,
    agentId: options.agentId,
  })

  // Call the cost callback if provided
  if (options.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await options.onCostCalculated(creditsUsed)
  }
}

// TODO: figure out a nice way to unify stream & non-stream versions maybe?
export const promptAiSdk = async function (
  options: {
    messages: Message[]
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
    agentId?: string
    onCostCalculated?: (credits: number) => Promise<void>
    includeCacheControl?: boolean
  } & Omit<Parameters<typeof generateText>[0], 'model' | 'messages'>,
): Promise<string> {
  if (
    !checkLiveUserInput(
      options.userId,
      options.userInputId,
      options.clientSessionId,
    )
  ) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping prompt due to canceled user input',
    )
    return ''
  }

  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  // Cost optimization: Apply task-based parameter optimization
  const taskType = detectTaskTypeFromMessages(options.messages)
  const optimalParams = getOptimalParametersByTask(taskType)
  
  // Only override if not explicitly set by caller
  const finalOptions = {
    ...options,
    temperature: (options as any).temperature ?? optimalParams.temperature,
    maxTokens: (options as any).maxTokens ?? optimalParams.maxTokens,
  }

  // Cost optimization: Check cache for similar requests  
  const cacheKey = generateCacheKey(options.messages, options.model, finalOptions)
  const cachedResponse = responseCache.get(cacheKey)
  
  if (cachedResponse && isCacheableSystemPrompt(options.messages)) {
    logger.debug({ cacheKey: cacheKey.substring(0, 32) + '...' }, 'Cache hit for prompt')
    
    // Return cached response but still track for cost accounting
    const creditsUsed = 0 // Cache hits are free!
    if (options.onCostCalculated) {
      await options.onCostCalculated(creditsUsed)
    }
    
    return cachedResponse
  }

  const response = await generateText({
    ...finalOptions,
    model: aiSDKModel,
    messages: convertCbToModelMessages(options),
  })
  
  const content = response.text
  
  // Cache successful responses for cacheable system prompts
  if (isCacheableSystemPrompt(options.messages) && content.length > 0) {
    responseCache.set(cacheKey, content, 15 * 60 * 1000) // 15 min cache
    logger.debug({ cacheKey: cacheKey.substring(0, 32) + '...' }, 'Cached prompt response')
  }
  
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.outputTokens || 0

  const creditsUsedPromise = saveMessage({
    messageId: generateCompactId(),
    userId: options.userId,
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    model: options.model,
    request: options.messages,
    response: content,
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: options.chargeUser ?? true,
    agentId: options.agentId,
  })

  // Call the cost callback if provided
  if (options.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await options.onCostCalculated(creditsUsed)
  }

  return content
}

// Copied over exactly from promptAiSdk but with a schema
export const promptAiSdkStructured = async function <T>(options: {
  messages: Message[]
  schema: z.ZodType<T>
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: Model
  userId: string | undefined
  maxTokens?: number
  temperature?: number
  timeout?: number
  chargeUser?: boolean
  agentId?: string
  onCostCalculated?: (credits: number) => Promise<void>
  includeCacheControl?: boolean
}): Promise<T> {
  if (
    !checkLiveUserInput(
      options.userId,
      options.userInputId,
      options.clientSessionId,
    )
  ) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping structured prompt due to canceled user input',
    )
    return {} as T
  }
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  // Cost optimization: Apply task-based parameter optimization
  const taskType = detectTaskTypeFromMessages(options.messages)
  const optimalParams = getOptimalParametersByTask(taskType)
  
  // Only override if not explicitly set by caller
  const finalOptions = {
    ...options,
    temperature: (options as any).temperature ?? optimalParams.temperature,
    maxTokens: (options as any).maxTokens ?? optimalParams.maxTokens,
  }

  const responsePromise = generateObject<z.ZodType<T>, 'object'>({
    ...finalOptions,
    model: aiSDKModel,
    output: 'object',
    messages: convertCbToModelMessages(options),
  })

  const response = await (options.timeout === undefined
    ? responsePromise
    : withTimeout(responsePromise, options.timeout))
  const content = response.object
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.inputTokens || 0

  const creditsUsedPromise = saveMessage({
    messageId: generateCompactId(),
    userId: options.userId,
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    model: options.model,
    request: options.messages,
    response: JSON.stringify(content),
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: options.chargeUser ?? true,
    agentId: options.agentId,
  })

  // Call the cost callback if provided
  if (options.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await options.onCostCalculated(creditsUsed)
  }

  return content
}
