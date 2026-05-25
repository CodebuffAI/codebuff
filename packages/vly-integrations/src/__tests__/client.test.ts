import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VlyClient } from '../client';
import type { VlyConfig } from '../types';

// Create a test class to access protected methods
class TestVlyClient extends VlyClient {
  public async testRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any,
    options?: any
  ) {
    return this.request<T>(endpoint, method, data, options);
  }

  public testLog(message: string, data?: any) {
    return this.log(message, data);
  }
}

describe('VlyClient', () => {
  let client: TestVlyClient;
  let config: VlyConfig;

  beforeEach(() => {
    config = {
      deploymentToken: 'test-token-123',
      debug: false, // Disable debug to reduce test noise
    };
    client = new TestVlyClient(config);

    // Mock fetch globally
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with required config', () => {
      expect(client).toBeDefined();
    });

    it('should set debug to false by default', () => {
      const clientWithoutDebug = new TestVlyClient({
        deploymentToken: 'test-token',
      });
      expect(clientWithoutDebug).toBeDefined();
    });
  });

  describe('request method', () => {
    it('should make successful API request', async () => {
      const mockResponse = {
        data: { message: 'success' },
        usage: { credits: 10, operation: 'test' }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.testRequest('/test', 'GET');

      expect(fetch).toHaveBeenCalledWith(
        'https://integrations.vly.ai/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123',
            'Content-Type': 'application/json',
            'X-Vly-Version': '0.1.0',
          }),
        })
      );

      expect(result).toEqual({
        success: true,
        data: mockResponse,
        usage: mockResponse.usage,
      });
    });

    it('should handle API errors', async () => {
      const errorResponse = {
        error: 'Invalid request'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(errorResponse),
      });

      const result = await client.testRequest('/test', 'POST', { data: 'test' });

      expect(result).toEqual({
        success: false,
        error: 'Invalid request',
      });
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await client.testRequest('/test', 'GET');

      expect(result).toEqual({
        success: false,
        error: 'Network error',
      });
    });

    it('should handle timeout', async () => {
      (global.fetch as any).mockImplementationOnce(() => 
        new Promise((resolve, reject) => {
          setTimeout(() => {
            const error = new Error('Request timeout');
            error.name = 'AbortError';
            reject(error);
          }, 50);
        })
      );

      const result = await client.testRequest('/test', 'GET', undefined, { timeout: 100 });

      expect(result).toEqual({
        success: false,
        error: 'Request timeout',
      });
    });

    it('should retry on failure', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' }),
        });

      const result = await client.testRequest('/test', 'GET', undefined, { retries: 1 });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        success: true,
        data: { data: 'success' },
        usage: undefined,
      });
    });

    it('should include request body for POST requests', async () => {
      const testData = { key: 'value' };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'success' }),
      });

      await client.testRequest('/test', 'POST', testData);

      expect(fetch).toHaveBeenCalledWith(
        'https://integrations.vly.ai/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(testData),
        })
      );
    });
  });

  describe('log method', () => {
    it('should log when debug is enabled', () => {
      // Create client with debug enabled
      const debugConfig = { ...config, debug: true };
      const debugClient = new TestVlyClient(debugConfig);
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      debugClient.testLog('Test message', { data: 'test' });

      expect(consoleSpy).toHaveBeenCalledWith('[Vly] Test message', { data: 'test' });
      
      consoleSpy.mockRestore();
    });

    it('should not log when debug is disabled', () => {
      const clientWithoutDebug = new TestVlyClient({
        deploymentToken: 'test-token',
        debug: false,
      });
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      clientWithoutDebug.testLog('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});