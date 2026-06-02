import type { VlyConfig, RequestOptions, ApiResponse } from './types';

export class VlyClient {
  protected config: Required<VlyConfig>;

  constructor(config: VlyConfig) {
    this.config = {
      deploymentToken: config.deploymentToken || 'vlytomoonF2024',
      debug: config.debug ?? false
    };
  }

  protected async request<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const url = `https://integrations.vly.ai${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.deploymentToken}`,
      'Content-Type': 'application/json',
      'X-Vly-Version': '0.1.0'
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    };

    // Add timeout using AbortController
    const controller = new AbortController();
    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);
      
      const responseData = await response.json().catch(() => ({})) as any;

      if (response.ok) {
        return {
          success: true,
          data: responseData as T,
          usage: responseData?.usage
        };
      } else {
        const error = responseData?.error || `Request failed with status ${response.status}`;
        
        if (this.config.debug) {
          console.error(`Vly API Error: ${error}`, {
            endpoint,
            status: response.status,
            data: responseData
          });
        }

        return {
          success: false,
          error
        };
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error.name === 'AbortError' ? 'Request timeout' : error.message || 'Unknown error occurred';
      
      if (this.config.debug) {
        console.error(`Vly API Request Failed: ${errorMessage}`, {
          endpoint,
          error
        });
      }

      if (options?.retries && options.retries > 0) {
        if (this.config.debug) {
          console.log(`Retrying request... (${options.retries} retries left)`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.request(endpoint, method, data, { 
          ...options, 
          retries: options.retries - 1 
        });
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  protected log(message: string, data?: any) {
    if (this.config.debug) {
      console.log(`[Vly] ${message}`, data || '');
    }
  }
}