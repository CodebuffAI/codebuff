import { CodebuffMessage } from '@codebuff/common/types/message'
import { AgentTemplateUnion } from './features/agents/templates/static/types'
import { getContainer } from './services/container'
import { models } from '@codebuff/common/constants'

export function getAgentStreamFromTemplate(options: {
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  template: AgentTemplateUnion
}): (messages: CodebuffMessage[]) => AsyncGenerator<string, void, unknown> {
  const { template, ...llmOptions } = options
  
  return async function* (messages: CodebuffMessage[]) {
    const container = getContainer()
    const llmService = container.llmService
    
    if (template.implementation !== 'llm') {
      throw new Error('getAgentStreamFromTemplate only supports LLM templates')
    }
    
    const stream = llmService.generateResponse({
      messages,
      model: template.model,
      ...llmOptions,
      chargeUser: true,
      thinkingBudget: 'thinkingBudget' in template ? (template as any).thinkingBudget : undefined,
      maxRetries: 3
    })
    
    for await (const chunk of stream) {
      yield chunk
    }
  }
}

export function getAgentStream(options: {
  costMode?: string
  selectedModel?: string
  stopSequences?: string[]
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
}): {
  getStream: (messages: CodebuffMessage[]) => AsyncGenerator<string, void, unknown>
  model: string
} {
  const model = options.selectedModel || models.openrouter_claude_sonnet_4
  
  return {
    getStream: async function* (messages: CodebuffMessage[]) {
      const container = getContainer()
      const llmService = container.llmService
      
      const stream = llmService.generateResponse({
        messages,
        model,
        clientSessionId: options.clientSessionId,
        fingerprintId: options.fingerprintId,
        userInputId: options.userInputId,
        userId: options.userId,
        chargeUser: true,
        maxRetries: 3
      })
      
      for await (const chunk of stream) {
        yield chunk
      }
    },
    model
  }
}
