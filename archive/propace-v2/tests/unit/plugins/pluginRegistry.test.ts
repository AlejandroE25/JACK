/**
 * Plugin Registry Tests (TDD)
 *
 * These tests define the expected behavior of the PluginRegistry.
 * Implementation should be built to pass these tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../../../src/plugins/pluginRegistry';
import {
  PluginCapability,
  type Plugin,
  type PluginTool,
  type ExecutionContext,
  type ToolResult
} from '../../../src/types/plugin';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  // Mock plugin for testing
  const createMockPlugin = (id: string, toolNames: string[] = ['test_tool']): Plugin => ({
    metadata: {
      id,
      name: `Test Plugin ${id}`,
      version: '1.0.0',
      author: 'Test Author',
      description: 'A test plugin',
      tags: ['test']
    },
    tools: toolNames.map(name => ({
      name,
      description: `Test tool ${name}`,
      category: 'test',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: async (params: Record<string, any>, context: ExecutionContext): Promise<ToolResult> => ({
        success: true,
        data: { message: `Executed ${name}` },
        metadata: { duration: 100, cached: false }
      })
    })),
    initialize: async (config: Record<string, any>) => {
      // Mock initialization
    }
  });

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('Plugin Registration', () => {
    it('should register a plugin successfully', async () => {
      const plugin = createMockPlugin('test.plugin1');
      await registry.register(plugin);

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].id).toBe('test.plugin1');
    });

    it('should throw error when registering duplicate plugin ID', async () => {
      const plugin1 = createMockPlugin('test.duplicate');
      const plugin2 = createMockPlugin('test.duplicate');

      await registry.register(plugin1);
      await expect(registry.register(plugin2)).rejects.toThrow('already registered');
    });

    it('should register multiple plugins', async () => {
      const plugin1 = createMockPlugin('test.plugin1');
      const plugin2 = createMockPlugin('test.plugin2');
      const plugin3 = createMockPlugin('test.plugin3');

      await registry.register(plugin1);
      await registry.register(plugin2);
      await registry.register(plugin3);

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(3);
    });

    it('should index tools during plugin registration', async () => {
      const plugin = createMockPlugin('test.plugin1', ['tool1', 'tool2', 'tool3']);
      await registry.register(plugin);

      expect(registry.getTool('tool1')).toBeDefined();
      expect(registry.getTool('tool2')).toBeDefined();
      expect(registry.getTool('tool3')).toBeDefined();
    });
  });

  describe('Plugin Unregistration', () => {
    it('should unregister a plugin successfully', async () => {
      const plugin = createMockPlugin('test.plugin1');
      await registry.register(plugin);

      await registry.unregister('test.plugin1');

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(0);
    });

    it('should remove tools when plugin is unregistered', async () => {
      const plugin = createMockPlugin('test.plugin1', ['tool1', 'tool2']);
      await registry.register(plugin);

      expect(registry.getTool('tool1')).toBeDefined();

      await registry.unregister('test.plugin1');

      expect(registry.getTool('tool1')).toBeUndefined();
      expect(registry.getTool('tool2')).toBeUndefined();
    });

    it('should throw error when unregistering non-existent plugin', async () => {
      await expect(registry.unregister('non.existent')).rejects.toThrow('not found');
    });
  });

  describe('Tool Lookup', () => {
    beforeEach(async () => {
      const plugin1 = createMockPlugin('test.plugin1', ['weather', 'forecast']);
      const plugin2 = createMockPlugin('test.plugin2', ['news', 'headlines']);
      await registry.register(plugin1);
      await registry.register(plugin2);
    });

    it('should retrieve tool by name', () => {
      const tool = registry.getTool('weather');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('weather');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = registry.getTool('non_existent_tool');
      expect(tool).toBeUndefined();
    });

    it('should get all tools', () => {
      const tools = registry.getAllTools();

      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.name)).toContain('weather');
      expect(tools.map(t => t.name)).toContain('forecast');
      expect(tools.map(t => t.name)).toContain('news');
      expect(tools.map(t => t.name)).toContain('headlines');
    });
  });

  describe('Category-based Lookup', () => {
    beforeEach(async () => {
      const weatherPlugin: Plugin = {
        metadata: {
          id: 'weather.plugin',
          name: 'Weather Plugin',
          version: '1.0.0',
          author: 'Test',
          description: 'Weather tools',
          tags: ['weather']
        },
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather',
            category: 'weather',
            capabilities: [PluginCapability.READ_ONLY],
            parameters: [],
            execute: async () => ({ success: true, data: {}, metadata: { duration: 100, cached: false } })
          },
          {
            name: 'get_forecast',
            description: 'Get forecast',
            category: 'weather',
            capabilities: [PluginCapability.READ_ONLY],
            parameters: [],
            execute: async () => ({ success: true, data: {}, metadata: { duration: 100, cached: false } })
          }
        ],
        initialize: async () => {}
      };

      const newsPlugin: Plugin = {
        metadata: {
          id: 'news.plugin',
          name: 'News Plugin',
          version: '1.0.0',
          author: 'Test',
          description: 'News tools',
          tags: ['news']
        },
        tools: [
          {
            name: 'get_news',
            description: 'Get news',
            category: 'news',
            capabilities: [PluginCapability.READ_ONLY],
            parameters: [],
            execute: async () => ({ success: true, data: {}, metadata: { duration: 100, cached: false } })
          }
        ],
        initialize: async () => {}
      };

      await registry.register(weatherPlugin);
      await registry.register(newsPlugin);
    });

    it('should get tools by category', () => {
      const weatherTools = registry.getToolsByCategory('weather');

      expect(weatherTools).toHaveLength(2);
      expect(weatherTools.map(t => t.name)).toContain('get_weather');
      expect(weatherTools.map(t => t.name)).toContain('get_forecast');
    });

    it('should return empty array for non-existent category', () => {
      const tools = registry.getToolsByCategory('non_existent_category');
      expect(tools).toHaveLength(0);
    });
  });

  describe('Plugin Metadata', () => {
    it('should list all registered plugin metadata', async () => {
      const plugin1 = createMockPlugin('plugin.one');
      const plugin2 = createMockPlugin('plugin.two');

      await registry.register(plugin1);
      await registry.register(plugin2);

      const metadata = registry.listPlugins();

      expect(metadata).toHaveLength(2);
      expect(metadata[0].id).toBe('plugin.one');
      expect(metadata[1].id).toBe('plugin.two');
    });

    it('should return plugin metadata by ID', async () => {
      const plugin = createMockPlugin('test.plugin');
      await registry.register(plugin);

      const metadata = registry.getPluginMetadata('test.plugin');

      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('Test Plugin test.plugin');
      expect(metadata?.version).toBe('1.0.0');
    });
  });

  describe('Dependency Validation', () => {
    it('should validate plugins with no dependencies', async () => {
      const plugin = createMockPlugin('test.plugin');
      const isValid = registry.validateDependencies(plugin);

      expect(isValid).toBe(true);
    });

    it('should validate plugins with satisfied dependencies', async () => {
      const basePlugin = createMockPlugin('base.plugin');
      await registry.register(basePlugin);

      const dependentPlugin: Plugin = {
        ...createMockPlugin('dependent.plugin'),
        metadata: {
          ...createMockPlugin('dependent.plugin').metadata,
          dependencies: ['base.plugin']
        }
      };

      const isValid = registry.validateDependencies(dependentPlugin);
      expect(isValid).toBe(true);
    });

    it('should reject plugins with unsatisfied dependencies', async () => {
      const dependentPlugin: Plugin = {
        ...createMockPlugin('dependent.plugin'),
        metadata: {
          ...createMockPlugin('dependent.plugin').metadata,
          dependencies: ['non.existent.plugin']
        }
      };

      const isValid = registry.validateDependencies(dependentPlugin);
      expect(isValid).toBe(false);
    });

    it('should reject registration of plugin with unsatisfied dependencies', async () => {
      const dependentPlugin: Plugin = {
        ...createMockPlugin('dependent.plugin'),
        metadata: {
          ...createMockPlugin('dependent.plugin').metadata,
          dependencies: ['missing.plugin']
        }
      };

      await expect(registry.register(dependentPlugin)).rejects.toThrow('dependencies');
    });
  });

  describe('Plugin Statistics', () => {
    it('should return correct plugin count', async () => {
      expect(registry.getPluginCount()).toBe(0);

      await registry.register(createMockPlugin('plugin1'));
      expect(registry.getPluginCount()).toBe(1);

      await registry.register(createMockPlugin('plugin2'));
      expect(registry.getPluginCount()).toBe(2);
    });

    it('should return correct tool count', async () => {
      const plugin1 = createMockPlugin('plugin1', ['tool1', 'tool2']);
      const plugin2 = createMockPlugin('plugin2', ['tool3', 'tool4', 'tool5']);

      await registry.register(plugin1);
      await registry.register(plugin2);

      expect(registry.getToolCount()).toBe(5);
    });
  });
});
