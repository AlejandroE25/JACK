import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../../src/services/memoryStore.js';
import { existsSync, unlinkSync } from 'fs';

describe('MemoryStore', () => {
  let memoryStore: MemoryStore;
  const TEST_DB_PATH = './test-memories.db';

  beforeEach(() => {
    // Remove test database if it exists
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    memoryStore = new MemoryStore(TEST_DB_PATH);
  });

  afterEach(() => {
    memoryStore.close();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('store', () => {
    it('should store a memory', () => {
      const memory = memoryStore.store({
        topic: 'user_preferences',
        content: 'User favorite color is blue',
        importance: 7,
        tags: 'favorite,color,preference',
      });

      expect(memory.id).toBeDefined();
      expect(memory.topic).toBe('user_preferences');
      expect(memory.content).toBe('User favorite color is blue');
      expect(memory.importance).toBe(7);
    });

    it('should auto-generate timestamp', () => {
      const memory = memoryStore.store({
        topic: 'test',
        content: 'test content',
        importance: 5,
      });

      expect(memory.timestamp).toBeDefined();
      expect(new Date(memory.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should handle metadata', () => {
      const metadata = { source: 'conversation', conversationId: '123' };
      const memory = memoryStore.store({
        topic: 'test',
        content: 'test content',
        importance: 5,
        metadata,
      });

      expect(memory.metadata).toEqual(metadata);
    });
  });

  describe('retrieve', () => {
    it('should retrieve memory by ID', () => {
      const stored = memoryStore.store({
        topic: 'test',
        content: 'test content',
        importance: 5,
      });

      const retrieved = memoryStore.retrieve(stored.id!);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.content).toBe('test content');
    });

    it('should return null for non-existent ID', () => {
      const result = memoryStore.retrieve(99999);
      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      memoryStore.store({
        topic: 'user_preferences',
        content: 'User favorite color is blue',
        importance: 7,
        tags: 'favorite,color,preference',
      });

      memoryStore.store({
        topic: 'user_info',
        content: 'User is a software developer',
        importance: 8,
        tags: 'occupation,developer,software',
      });

      memoryStore.store({
        topic: 'user_preferences',
        content: 'User prefers dark mode',
        importance: 6,
        tags: 'preference,dark mode,ui',
      });
    });

    it('should search by topic', () => {
      const results = memoryStore.search({ topic: 'user_preferences' });

      expect(results.length).toBe(2);
      expect(results[0].topic).toBe('user_preferences');
    });

    it('should search by tags', () => {
      const results = memoryStore.search({ tags: 'developer' });

      expect(results.length).toBe(1);
      expect(results[0].content).toContain('software developer');
    });

    it('should search by content keywords', () => {
      const results = memoryStore.search({ keyword: 'blue' });

      expect(results.length).toBe(1);
      expect(results[0].content).toContain('blue');
    });

    it('should limit results', () => {
      const results = memoryStore.search({}, 1);

      expect(results.length).toBe(1);
    });

    it('should return results ordered by importance', () => {
      const results = memoryStore.search({});

      // Should be ordered by importance descending
      expect(results[0].importance).toBeGreaterThanOrEqual(results[1].importance);
    });
  });

  describe('getAll', () => {
    it('should return all memories', () => {
      memoryStore.store({ topic: 'test1', content: 'content1', importance: 5 });
      memoryStore.store({ topic: 'test2', content: 'content2', importance: 5 });

      const all = memoryStore.getAll();

      expect(all.length).toBe(2);
    });

    it('should return empty array when no memories exist', () => {
      const all = memoryStore.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete memory by ID', () => {
      const stored = memoryStore.store({
        topic: 'test',
        content: 'test content',
        importance: 5,
      });

      const deleted = memoryStore.delete(stored.id!);
      expect(deleted).toBe(true);

      const retrieved = memoryStore.retrieve(stored.id!);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent ID', () => {
      const result = memoryStore.delete(99999);
      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should return correct count', () => {
      expect(memoryStore.count()).toBe(0);

      memoryStore.store({ topic: 'test1', content: 'content1', importance: 5 });
      expect(memoryStore.count()).toBe(1);

      memoryStore.store({ topic: 'test2', content: 'content2', importance: 5 });
      expect(memoryStore.count()).toBe(2);
    });
  });
});
