import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, type CoreMessage } from 'ai';
import type { 
  AICompletionRequest, 
  AICompletionResponse,
  RequestOptions,
  ApiResponse,
  VlyConfig
} from '../types';

export class VlyAI {
  private provider: ReturnType<typeof createOpenAICompatible>;
  private config: VlyConfig;

  constructor(config: VlyConfig) {
    this.config = config;
    this.provider = createOpenAICompatible({
      name: 'vly-gateway',
      baseURL: 'https://integrations.vly.ai/v1/llm',
      headers: {
        'Authorization': `Bearer ${config.deploymentToken}`,
      },
    });
  }

  private getModel(modelName?: string) {
    return this.provider(modelName || 'gpt-5');
  }

  private mapMessages(messages: AICompletionRequest['messages']): CoreMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  async completion(
    request: AICompletionRequest, 
    _options?: RequestOptions
  ): Promise<ApiResponse<AICompletionResponse>> {
    if (this.config.debug) {
      console.log('[Vly] Creating AI completion', { model: request.model });
    }

    try {
      const model = this.getModel(request.model);
      const messages = this.mapMessages(request.messages);

      const result = await generateText({
        model: model as any,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      });

      const responseData: AICompletionResponse = {
        id: `vly-${Date.now()}`,
        choices: [{
          message: {
            role: 'assistant',
            content: result.text
          },
          finishReason: result.finishReason || 'stop'
        }],
        usage: {
          promptTokens: result.usage?.inputTokens || 0,
          completionTokens: result.usage?.outputTokens || 0,
          totalTokens: result.usage?.totalTokens || 0
        }
      };

      if (this.config.debug) {
        console.log('[Vly] AI completion successful', { 
          tokensUsed: responseData.usage.totalTokens 
        });
      }

      return {
        success: true,
        data: responseData
      };
    } catch (error: any) {
      if (this.config.debug) {
        console.error('[Vly] AI completion failed', { error: error.message });
      }
      
      return {
        success: false,
        error: error.message || 'Request failed'
      };
    }
  }

  async streamCompletion(
    request: AICompletionRequest,
    onChunk: (chunk: string) => void,
    _options?: RequestOptions
  ): Promise<ApiResponse<AICompletionResponse>> {
    if (this.config.debug) {
      console.log('[Vly] Creating streaming AI completion', { model: request.model });
    }

    try {
      const model = this.getModel(request.model);
      const messages = this.mapMessages(request.messages);

      const result = await streamText({
        model: model as any,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      });

      let fullResponse = '';

      for await (const delta of result.textStream) {
        fullResponse += delta;
        onChunk(delta);
      }

      // Wait for the stream to complete and get usage info
      const usage = await result.usage;

      const responseData: AICompletionResponse = {
        id: `vly-stream-${Date.now()}`,
        choices: [{
          message: {
            role: 'assistant',
            content: fullResponse
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: usage?.inputTokens || 0,
          completionTokens: usage?.outputTokens || 0,
          totalTokens: usage?.totalTokens || 0
        }
      };

      if (this.config.debug) {
        console.log('[Vly] Streaming AI completion successful', { 
          tokensUsed: responseData.usage.totalTokens 
        });
      }

      return {
        success: true,
        data: responseData
      };
    } catch (error: any) {
      if (this.config.debug) {
        console.error('[Vly] Streaming AI completion failed', { error: error.message });
      }
      
      return {
        success: false,
        error: error.message || 'Streaming request failed'
      };
    }
  }

  async embeddings(
    input: string | string[],
    _options?: RequestOptions & { model?: string }
  ): Promise<ApiResponse<{ embeddings: number[][]; usage: any }>> {
    if (this.config.debug) {
      console.log('[Vly] Creating embeddings', { inputCount: Array.isArray(input) ? input.length : 1 });
    }
    
    // Note: AI SDK doesn't have embeddings support for OpenAI-compatible providers yet
    // This would need to be implemented separately or use a different approach
    return {
      success: false,
      error: 'Embeddings not yet supported with AI SDK OpenAI-compatible provider'
    };
  }

  // Helper method to get the provider for direct AI SDK usage
  getProvider() {
    return this.provider;
  }
}