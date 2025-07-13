import { ILLMService, LLMGenerationOptions, StructuredLLMOptions } from './interfaces'
import { promptAiSdkStream, promptAiSdkStructured } from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { models } from '@codebuff/common/constants'

export class LLMService implements ILLMService {
  async *generateResponse(options: LLMGenerationOptions): AsyncGenerator<string> {
    const {
      messages,
      model,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      chargeUser,
      thinkingBudget,
      maxRetries
    } = options

    const stream = promptAiSdkStream({
      messages,
      model: model as any, // Type assertion for model compatibility
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      chargeUser,
      thinkingBudget,
      maxRetries
    })

    for await (const chunk of stream) {
      yield chunk
    }
  }

  async generateStructuredResponse<T>(options: StructuredLLMOptions<T>): Promise<T> {
    const {
      messages,
      model,
      schema,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxTokens,
      temperature,
      timeout,
      chargeUser
    } = options

    return promptAiSdkStructured({
      messages,
      model: model as any, // Type assertion for model compatibility
      schema,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxTokens,
      temperature,
      timeout,
      chargeUser
    })
  }
}
