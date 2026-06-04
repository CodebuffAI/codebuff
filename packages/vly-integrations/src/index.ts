import type { VlyConfig } from './types';
import { VlyAI } from './ai';
import { VlyEmail } from './email';
import './project-thumbnail';

export * from './types';
export type { AIModel } from './types';

// Vite plugin export
export { vlyPlugin } from './vite-plugin';

// Re-export AI SDK types for convenience
export type { CoreMessage } from 'ai';

// Re-export project thumbnail types
export type { ScreenshotMessage } from './project-thumbnail';
export { initScreenshotListener, initVly } from './project-thumbnail';

const DEFAULT_DEPLOYMENT_TOKEN = 'vlytomoonF2024';

export class VlyIntegrations {
  public readonly ai: VlyAI;
  public readonly email: VlyEmail;
  public readonly config: Required<VlyConfig>;

  constructor(config: VlyConfig) {
    const normalizedToken =
      config.deploymentToken && config.deploymentToken.trim().length > 0
        ? config.deploymentToken
        : DEFAULT_DEPLOYMENT_TOKEN;

    this.config = {
      deploymentToken: normalizedToken,
      debug: config.debug ?? false,
    };

    this.ai = new VlyAI(this.config);
    this.email = new VlyEmail(this.config);
  }
}

export function createVlyIntegrations(config: VlyConfig): VlyIntegrations {
  return new VlyIntegrations(config);
}

export { VlyAI, VlyEmail };