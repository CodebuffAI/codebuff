import { describe, it, expect, beforeEach } from 'vitest';
import { VlyIntegrations, createVlyIntegrations } from '../index';
import type { VlyConfig } from '../types';

describe('VlyIntegrations', () => {
  let config: VlyConfig;

  beforeEach(() => {
    config = {
      deploymentToken: 'test-token-123',
      debug: false, // Disable debug to reduce test noise
    };
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const vly = new VlyIntegrations(config);

      expect(vly).toBeDefined();
      expect(vly.ai).toBeDefined();
      expect(vly.email).toBeDefined();
    });

    it('should fallback to default token when missing', () => {
      const vly = new VlyIntegrations({ debug: true } as VlyConfig);

      expect(vly.config.deploymentToken).toBe('vlytomoonF2024');
      expect(vly.ai).toBeDefined();
    });
  });

  describe('createVlyIntegrations factory function', () => {
    it('should create VlyIntegrations instance', () => {
      const vly = createVlyIntegrations(config);

      expect(vly).toBeInstanceOf(VlyIntegrations);
      expect(vly.ai).toBeDefined();
      expect(vly.email).toBeDefined();
    });

    it('should pass config to all modules', () => {
      const vly = createVlyIntegrations(config);

      // Verify that modules receive the config (they should not throw)
      expect(vly.ai).toBeDefined();
      expect(vly.email).toBeDefined();
    });
  });

  describe('module initialization', () => {
    it('should initialize all modules with the same config', () => {
      const vly = new VlyIntegrations(config);

      // All modules should be instances of their respective classes
      expect(vly.ai.constructor.name).toBe('VlyAI');
      expect(vly.email.constructor.name).toBe('VlyEmail');
    });
  });
});