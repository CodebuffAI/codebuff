import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VlyAI } from '../ai';
import type { VlyConfig } from '../types';

// Mock fetch to intercept HTTP requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('VlyAI - Endpoint Verification', () => {
  let ai: VlyAI;
  let config: VlyConfig;

  beforeEach(() => {
    config = {
      deploymentToken: 'sk_d82092cf479dd22d1aa835646e0a602035822406223de0829e4551d47d3811d2',
      debug: true,
    };

    // Mock successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'Hello from API!'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15
        }
      }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    
    ai = new VlyAI(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call the correct endpoint that matches curl request', async () => {
    const request = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user' as const, content: 'Hello' }],
      maxTokens: 20
    };

    try {
      await ai.completion(request);
    } catch (error) {
      // We expect this to potentially fail since we're mocking, but we want to see the URL
      console.log('Expected error during test:', error);
    }

    // Check if fetch was called
    expect(mockFetch).toHaveBeenCalled();
    
    if (mockFetch.mock.calls.length > 0) {
      const [url, options] = mockFetch.mock.calls[0];
      
      console.log('🔍 Intercepted API call:');
      console.log('URL:', url);
      console.log('Method:', options?.method);
      console.log('Headers:', options?.headers);
      console.log('Body:', options?.body);

      console.log('\n📋 Expected from working curl:');
      console.log('URL: https://integrations.vly.ai/v1/llm/chat/completions');
      console.log('Method: POST');
      console.log('Authorization: Bearer sk_d82092cf479dd22d1aa835646e0a602035822406223de0829e4551d47d3811d2');

      // Verify the URL matches the working curl request
      expect(url).toBe('https://integrations.vly.ai/v1/llm/chat/completions');
    }
  });
});