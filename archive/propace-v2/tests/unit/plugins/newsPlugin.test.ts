/**
 * News Plugin Tests (TDD)
 *
 * Tests for the News plugin adapter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NewsPlugin } from '../../../src/plugins/core/newsPlugin';
import { PluginCapability } from '../../../src/types/plugin';

describe('NewsPlugin', () => {
  let plugin: NewsPlugin;

  beforeEach(() => {
    plugin = new NewsPlugin();
  });

  describe('Plugin Metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.metadata.id).toBe('core.news');
      expect(plugin.metadata.name).toBe('News Service');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.tags).toContain('news');
      expect(plugin.metadata.tags).toContain('core');
    });
  });

  describe('Plugin Tools', () => {
    it('should provide get_news tool', () => {
      const tool = plugin.tools.find(t => t.name === 'get_news');

      expect(tool).toBeDefined();
      expect(tool?.description).toContain('news');
      expect(tool?.category).toBe('news');
    });

    it('should mark get_news as READ_ONLY', () => {
      const tool = plugin.tools.find(t => t.name === 'get_news');

      expect(tool?.capabilities).toContain(PluginCapability.READ_ONLY);
    });

    it('should have optional count parameter', () => {
      const tool = plugin.tools.find(t => t.name === 'get_news');
      const countParam = tool?.parameters.find(p => p.name === 'count');

      expect(countParam).toBeDefined();
      expect(countParam?.type).toBe('number');
      expect(countParam?.required).toBe(false);
      expect(countParam?.default).toBe(5);
    });
  });

  describe('Plugin Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(plugin.initialize({})).resolves.not.toThrow();
    });
  });

  describe('Health Check', () => {
    it('should have healthCheck method', () => {
      expect(plugin.healthCheck).toBeDefined();
    });

    it('should return boolean from health check', async () => {
      await plugin.initialize({});
      const isHealthy = await plugin.healthCheck!();

      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Tool Execution', () => {
    beforeEach(async () => {
      await plugin.initialize({});
    });

    it('should execute get_news with default count', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_news')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      const result = await tool.execute({}, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data.headlines)).toBe(true);
      }
    });

    it('should execute get_news with custom count', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_news')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      const result = await tool.execute({ count: 3 }, context);

      expect(result).toBeDefined();
      if (result.success && result.data.headlines) {
        expect(result.data.headlines.length).toBeLessThanOrEqual(3);
      }
    });

    it('should include metadata with duration', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_news')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      const result = await tool.execute({}, context);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.duration).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const tool = plugin.tools.find(t => t.name === 'get_news')!;
      const context = {
        clientId: 'test-client',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      const result = await tool.execute({}, context);

      // Should always return a result (success or error)
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('Plugin Shutdown', () => {
    it('should cleanup on shutdown', async () => {
      await plugin.initialize({});

      if (plugin.shutdown) {
        await expect(plugin.shutdown()).resolves.not.toThrow();
      }
    });
  });
});
