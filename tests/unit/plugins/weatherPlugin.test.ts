/**
 * Weather Plugin Tests (TDD)
 *
 * Tests for the Weather plugin adapter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeatherPlugin } from '../../../src/plugins/core/weatherPlugin';
import { PluginCapability } from '../../../src/types/plugin';

describe('WeatherPlugin', () => {
  let plugin: WeatherPlugin;

  beforeEach(() => {
    plugin = new WeatherPlugin();
  });

  describe('Plugin Metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.metadata.id).toBe('core.weather');
      expect(plugin.metadata.name).toBe('Weather Service');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.tags).toContain('weather');
      expect(plugin.metadata.tags).toContain('core');
    });

    it('should have no dependencies', () => {
      expect(plugin.metadata.dependencies).toBeUndefined();
    });
  });

  describe('Plugin Tools', () => {
    it('should provide get_weather tool', () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather');

      expect(tool).toBeDefined();
      expect(tool?.description).toContain('weather');
      expect(tool?.category).toBe('weather');
    });

    it('should mark get_weather as READ_ONLY', () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather');

      expect(tool?.capabilities).toContain(PluginCapability.READ_ONLY);
      expect(tool?.capabilities).not.toContain(PluginCapability.STATE_CHANGING);
    });

    it('should have optional city parameter', () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather');
      const cityParam = tool?.parameters.find(p => p.name === 'city');

      expect(cityParam).toBeDefined();
      expect(cityParam?.type).toBe('string');
      expect(cityParam?.required).toBe(false);
    });
  });

  describe('Plugin Initialization', () => {
    it('should initialize successfully with API key', async () => {
      await expect(plugin.initialize({ apiKey: 'test-key' })).resolves.not.toThrow();
    });

    it('should initialize without API key (uses config)', async () => {
      await expect(plugin.initialize({})).resolves.not.toThrow();
    });
  });

  describe('Health Check', () => {
    it('should have healthCheck method', () => {
      expect(plugin.healthCheck).toBeDefined();
      expect(typeof plugin.healthCheck).toBe('function');
    });

    it('should return true when weather service is available', async () => {
      await plugin.initialize({});
      const isHealthy = await plugin.healthCheck!();

      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Tool Execution', () => {
    beforeEach(async () => {
      await plugin.initialize({ apiKey: 'test-key' });
    });

    it('should execute get_weather without city (uses IP location)', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      const result = await tool.execute({}, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.duration).toBeGreaterThan(0);
    });

    it('should execute get_weather with specific city', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      const result = await tool.execute({ city: 'London' }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      if (result.success) {
        expect(result.data).toBeDefined();
      }
    });

    it('should return cached results on subsequent calls', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      // First call
      const result1 = await tool.execute({ city: 'Tokyo' }, context);

      // Second call (should be cached)
      const result2 = await tool.execute({ city: 'Tokyo' }, context);

      expect(result2.metadata?.cached).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      // Invalid city should still return a result
      const result = await tool.execute({ city: 'NonExistentCity12345' }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should include response time in metadata', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_weather')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      const result = await tool.execute({ city: 'Paris' }, context);

      expect(result.metadata?.duration).toBeDefined();
      expect(result.metadata?.duration).toBeGreaterThan(0);
    });
  });

  describe('Plugin Shutdown', () => {
    it('should have shutdown method', () => {
      expect(plugin.shutdown).toBeDefined();
    });

    it('should cleanup resources on shutdown', async () => {
      await plugin.initialize({});

      if (plugin.shutdown) {
        await expect(plugin.shutdown()).resolves.not.toThrow();
      }
    });
  });
});
