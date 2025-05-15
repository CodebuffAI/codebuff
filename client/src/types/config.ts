export interface RetryOptions {
  initialDelay: number;
  maxDelay: number;
  maxAttempts: number;
  backoffFactor: number;
}

export interface ClientConfig {
  websocketUrl: string;
  projectRoot: string;
  retry?: RetryOptions;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  initialDelay: 1000,
  maxDelay: 30000,
  maxAttempts: 5,
  backoffFactor: 2
};