import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VlyAI } from '../ai';
import type { VlyConfig, AICompletionRequest } from '../types';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => vi.fn()),
}));

import { generateText, streamText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

describe('VlyAI', () => {
  let ai: VlyAI;
  let config: VlyConfig;
  let mockProvider: any;

  beforeEach(() => {
    config = {
      deploymentToken: 'test-token-123',
      debug: false, // Disable debug to reduce test noise
    };

    mockProvider = vi.fn().mockReturnValue('mock-model-instance');
    (createOpenAICompatible as any).mockReturnValue(mockProvider);
    
    ai = new VlyAI(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct provider configuration', () => {
      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: 'vly-gateway',
        baseURL: 'https://integrations.vly.ai/v1/llm',
        headers: {
          'Authorization': 'Bearer test-token-123',
        },
      });
    });
  });

  describe('completion', () => {
    const mockRequest: AICompletionRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello, world!' }
      ],
      temperature: 0.7,
      maxTokens: 100,
    };

    it('should handle successful completion', async () => {
      const mockResult = {
        text: 'Hello! How can I help you?',
        finishReason: 'stop',
        usage: {
          inputTokens: 10,
          outputTokens: 15,
          totalTokens: 25,
        },
      };

      (generateText as any).mockResolvedValue(mockResult);

      const result = await ai.completion(mockRequest);

      expect(generateText).toHaveBeenCalledWith({
        model: 'mock-model-instance',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        temperature: 0.7,
        maxOutputTokens: 100,
      });

      // Verify that the provider was called with the correct model name
      expect(mockProvider).toHaveBeenCalledWith('gpt-4');

      expect(result).toEqual({
        success: true,
        data: {
          id: expect.stringMatching(/^vly-\d+$/),
          choices: [{
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?'
            },
            finishReason: 'stop'
          }],
          usage: {
            promptTokens: 10,
            completionTokens: 15,
            totalTokens: 25
          }
        }
      });
    });

    it('should use default model when none specified', async () => {
      const requestWithoutModel = { ...mockRequest };
      delete requestWithoutModel.model;

      const mockResult = {
        text: 'Response',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };

      (generateText as any).mockResolvedValue(mockResult);

      await ai.completion(requestWithoutModel);

      expect(mockProvider).toHaveBeenCalledWith('gpt-5');
    });

    it('should handle errors', async () => {
      const error = new Error('API Error');
      (generateText as any).mockRejectedValue(error);

      const result = await ai.completion(mockRequest);

      expect(result).toEqual({
        success: false,
        error: 'API Error'
      });
    });

    it('should log debug information when debug is enabled', async () => {
      // Create AI instance with debug enabled
      const debugConfig = { ...config, debug: true };
      const debugAI = new VlyAI(debugConfig);
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const mockResult = {
        text: 'Response',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };

      (generateText as any).mockResolvedValue(mockResult);

      await debugAI.completion(mockRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Vly] Creating AI completion',
        { model: 'gpt-4' }
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Vly] AI completion successful',
        { tokensUsed: 10 }
      );

      consoleSpy.mockRestore();
    });
  });

  describe('streamCompletion', () => {
    const mockRequest: AICompletionRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Tell me a story' }
      ],
    };

    it('should handle successful streaming completion', async () => {
      const chunks = ['Once', ' upon', ' a', ' time...'];
      let chunkIndex = 0;
      const onChunk = vi.fn();

      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) {
            yield chunk;
          }
        }
      };

      const mockResult = {
        textStream: mockTextStream,
        usage: Promise.resolve({
          inputTokens: 20,
          outputTokens: 30,
          totalTokens: 50,
        }),
      };

      (streamText as any).mockResolvedValue(mockResult);

      const result = await ai.streamCompletion(mockRequest, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(4);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'Once');
      expect(onChunk).toHaveBeenNthCalledWith(2, ' upon');
      expect(onChunk).toHaveBeenNthCalledWith(3, ' a');
      expect(onChunk).toHaveBeenNthCalledWith(4, ' time...');

      expect(result).toEqual({
        success: true,
        data: {
          id: expect.stringMatching(/^vly-stream-\d+$/),
          choices: [{
            message: {
              role: 'assistant',
              content: 'Once upon a time...'
            },
            finishReason: 'stop'
          }],
          usage: {
            promptTokens: 20,
            completionTokens: 30,
            totalTokens: 50
          }
        }
      });
    });

    it('should handle streaming errors', async () => {
      const error = new Error('Stream Error');
      const onChunk = vi.fn();
      
      (streamText as any).mockRejectedValue(error);

      const result = await ai.streamCompletion(mockRequest, onChunk);

      expect(result).toEqual({
        success: false,
        error: 'Stream Error'
      });
    });
  });

  describe('embeddings', () => {
    it('should return not supported error', async () => {
      const result = await ai.embeddings('test input');

      expect(result).toEqual({
        success: false,
        error: 'Embeddings not yet supported with AI SDK OpenAI-compatible provider'
      });
    });

    it('should log debug information', async () => {
      // Create AI instance with debug enabled
      const debugConfig = { ...config, debug: true };
      const debugAI = new VlyAI(debugConfig);
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await debugAI.embeddings(['input1', 'input2']);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Vly] Creating embeddings',
        { inputCount: 2 }
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getProvider', () => {
    it('should return the provider', () => {
      const provider = ai.getProvider();
      expect(provider).toBe(mockProvider);
    });
  });

  describe('message mapping', () => {
    it('should correctly map message format', async () => {
      const complexMessages = [
        { role: 'system' as const, content: 'You are a helpful assistant' },
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' },
      ];

      const mockResult = {
        text: 'I am fine, thank you!',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };

      (generateText as any).mockResolvedValue(mockResult);

      await ai.completion({
        messages: complexMessages,
      });

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: complexMessages
        })
      );
    });
  });
});