/**
 * Memory Plugin Tests (TDD)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryPlugin } from '../../../src/plugins/core/memoryPlugin';
import { PluginCapability } from '../../../src/types/plugin';
import { existsSync, unlinkSync } from 'fs';

describe('MemoryPlugin', () => {
  let plugin: MemoryPlugin;
  const TEST_DB_PATH = './test-memory-plugin.db';

  beforeEach(async () => {
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    plugin = new MemoryPlugin();
    await plugin.initialize({ dbPath: TEST_DB_PATH });
  });

  afterEach(async () => {
    if (plugin.shutdown) {
      await plugin.shutdown();
    }
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Plugin Metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.metadata.id).toBe('core.memory');
      expect(plugin.metadata.name).toBe('Memory Service');
      expect(plugin.metadata.tags).toContain('memory');
      expect(plugin.metadata.tags).toContain('core');
    });
  });

  describe('Plugin Tools', () => {
    it('should provide store_memory tool', () => {
      const tool = plugin.tools.find(t => t.name === 'store_memory');
      expect(tool).toBeDefined();
      expect(tool?.capabilities).toContain(PluginCapability.STATE_CHANGING);
    });

    it('should provide search_memory tool', () => {
      const tool = plugin.tools.find(t => t.name === 'search_memory');
      expect(tool).toBeDefined();
      expect(tool?.capabilities).toContain(PluginCapability.READ_ONLY);
    });

    it('should provide recall_memory tool', () => {
      const tool = plugin.tools.find(t => t.name === 'recall_memory');
      expect(tool).toBeDefined();
      expect(tool?.capabilities).toContain(PluginCapability.READ_ONLY);
    });

    it('should provide delete_memory tool', () => {
      const tool = plugin.tools.find(t => t.name === 'delete_memory');
      expect(tool).toBeDefined();
      expect(tool?.capabilities).toContain(PluginCapability.STATE_CHANGING);
    });
  });

  describe('Tool Parameters', () => {
    it('store_memory should have required parameters', () => {
      const tool = plugin.tools.find(t => t.name === 'store_memory');
      const topicParam = tool?.parameters.find(p => p.name === 'topic');
      const contentParam = tool?.parameters.find(p => p.name === 'content');
      const importanceParam = tool?.parameters.find(p => p.name === 'importance');

      expect(topicParam?.required).toBe(true);
      expect(contentParam?.required).toBe(true);
      expect(importanceParam?.required).toBe(true);
    });

    it('search_memory should have optional parameters', () => {
      const tool = plugin.tools.find(t => t.name === 'search_memory');
      const topicParam = tool?.parameters.find(p => p.name === 'topic');

      expect(topicParam?.required).toBe(false);
    });

    it('recall_memory should have limit parameter', () => {
      const tool = plugin.tools.find(t => t.name === 'recall_memory');
      const limitParam = tool?.parameters.find(p => p.name === 'limit');

      expect(limitParam).toBeDefined();
      expect(limitParam?.default).toBe(10);
    });
  });

  describe('Tool Execution', () => {
    const context = {
      clientId: 'test-client',
      conversationHistory: [],
      previousStepResults: new Map()
    };

    it('should store a memory', async () => {
      const tool = plugin.tools.find(t => t.name === 'store_memory')!;
      const result = await tool.execute({
        topic: 'user_preferences',
        content: 'User prefers TypeScript',
        importance: 8,
        tags: 'preference,language'
      }, context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.memory.topic).toBe('user_preferences');
      expect(result.data.memory.id).toBeDefined();
    });

    it('should search memories by topic', async () => {
      // Store a memory first
      const storeTool = plugin.tools.find(t => t.name === 'store_memory')!;
      await storeTool.execute({
        topic: 'user_info',
        content: 'User is a developer',
        importance: 7
      }, context);

      // Search for it
      const searchTool = plugin.tools.find(t => t.name === 'search_memory')!;
      const result = await searchTool.execute({ topic: 'user_info' }, context);

      expect(result.success).toBe(true);
      expect(result.data.memories).toBeDefined();
      expect(result.data.memories.length).toBeGreaterThan(0);
      expect(result.data.memories[0].topic).toBe('user_info');
    });

    it('should recall recent memories', async () => {
      // Store a couple of memories
      const storeTool = plugin.tools.find(t => t.name === 'store_memory')!;
      await storeTool.execute({
        topic: 'test1',
        content: 'First memory',
        importance: 5
      }, context);
      await storeTool.execute({
        topic: 'test2',
        content: 'Second memory',
        importance: 6
      }, context);

      // Recall them
      const recallTool = plugin.tools.find(t => t.name === 'recall_memory')!;
      const result = await recallTool.execute({ limit: 5 }, context);

      expect(result.success).toBe(true);
      expect(result.data.memories).toBeDefined();
      expect(result.data.memories.length).toBe(2);
    });

    it('should delete a memory', async () => {
      // Store a memory
      const storeTool = plugin.tools.find(t => t.name === 'store_memory')!;
      const storeResult = await storeTool.execute({
        topic: 'test',
        content: 'To be deleted',
        importance: 5
      }, context);

      const memoryId = storeResult.data.memory.id;

      // Delete it
      const deleteTool = plugin.tools.find(t => t.name === 'delete_memory')!;
      const deleteResult = await deleteTool.execute({ id: memoryId }, context);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data.deleted).toBe(true);
    });

    it('should include metadata with duration', async () => {
      const tool = plugin.tools.find(t => t.name === 'store_memory')!;
      const result = await tool.execute({
        topic: 'test',
        content: 'test content',
        importance: 5
      }, context);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Health Check', () => {
    it('should have healthCheck method', () => {
      expect(plugin.healthCheck).toBeDefined();
    });

    it('should return true when initialized', async () => {
      const isHealthy = await plugin.healthCheck!();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Plugin Shutdown', () => {
    it('should cleanup on shutdown', async () => {
      if (plugin.shutdown) {
        await expect(plugin.shutdown()).resolves.not.toThrow();
      }
    });
  });
});
