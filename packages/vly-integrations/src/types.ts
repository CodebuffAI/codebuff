export interface VlyConfig {
  deploymentToken?: string;
  debug?: boolean;
}

export interface RequestOptions {
  timeout?: number;
  retries?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}

// AIModel accepts any string to support all models available through the Vercel AI Gateway
export type AIModel = string;

export interface AICompletionRequest {
  model?: AIModel;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AICompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finishReason: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EmailRequest {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    encoding?: string;
  }>;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface EmailResponse {
  id: string;
  status: 'sent' | 'queued' | 'failed';
  messageId?: string;
  error?: string;
}