import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ContextManager } from '../../../src/capabilities/contextManager';
import type { ParsedIntent, RecentIntent, ActiveResource } from '../../../src/types';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextManager', () => {
  let manager: ContextManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Use temp file for SQLite to avoid polluting real memory
    testDbPath = join(tmpdir(), `jack-test-${Date.now()}.db`);
    manager = new ContextManager({ dbPath: testDbPath });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
    try {
      await unlink(testDbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('Short-term context (recent intents)', () => {
    const mockIntent: ParsedIntent = {
      id: 'intent-1',
      action: 'get_weather',
      parameters: { location: 'San Francisco' },
      dependencies: [],
    };

    test('records and retrieves recent intents', () => {
      manager.recordIntent('client-1', mockIntent, { temp: 72 });

      const recent = manager.getRecentIntents('client-1');

      expect(recent).toHaveLength(1);
      expect(recent[0].intent.action).toBe('get_weather');
      expect(recent[0].result).toEqual({ temp: 72 });
    });

    test('returns empty array for unknown client', () => {
      const recent = manager.getRecentIntents('unknown-client');
      expect(recent).toEqual([]);
    });

    test('limits to 3 most recent intents', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordIntent('client-1', { ...mockIntent, id: `intent-${i}` }, { n: i });
      }

      const recent = manager.getRecentIntents('client-1');

      expect(recent).toHaveLength(3);
      // Most recent first
      expect((recent[0].result as { n: number }).n).toBe(4);
      expect((recent[1].result as { n: number }).n).toBe(3);
      expect((recent[2].result as { n: number }).n).toBe(2);
    });

    test('expires intents older than 60 seconds', async () => {
      // Record with old timestamp
      manager.recordIntent('client-1', mockIntent, { temp: 72 });

      // Manually expire by setting timestamp in the past
      const recent = manager.getRecentIntents('client-1');
      (recent[0] as { timestamp: number }).timestamp = Date.now() - 61000;

      // Get should filter out expired
      const filtered = manager.getRecentIntents('client-1');
      expect(filtered).toHaveLength(0);
    });

    test('separates intents by client', () => {
      manager.recordIntent('client-1', { ...mockIntent, id: 'i1' }, { a: 1 });
      manager.recordIntent('client-2', { ...mockIntent, id: 'i2' }, { b: 2 });

      expect(manager.getRecentIntents('client-1')).toHaveLength(1);
      expect(manager.getRecentIntents('client-2')).toHaveLength(1);
      expect(manager.getRecentIntents('client-1')[0].intent.id).toBe('i1');
      expect(manager.getRecentIntents('client-2')[0].intent.id).toBe('i2');
    });

    test('clears intents for a client', () => {
      manager.recordIntent('client-1', mockIntent, {});
      manager.recordIntent('client-2', mockIntent, {});

      manager.clearRecentIntents('client-1');

      expect(manager.getRecentIntents('client-1')).toHaveLength(0);
      expect(manager.getRecentIntents('client-2')).toHaveLength(1);
    });
  });

  describe('Session context (active resource)', () => {
    test('sets and gets active resource', () => {
      const resource: ActiveResource = {
        type: 'file',
        path: '/Users/test/report.pdf',
        activatedAt: Date.now(),
      };

      manager.setActiveResource('client-1', resource);
      const retrieved = manager.getActiveResource('client-1');

      expect(retrieved).toEqual(resource);
    });

    test('returns null for no active resource', () => {
      expect(manager.getActiveResource('client-1')).toBeNull();
    });

    test('clears active resource', () => {
      manager.setActiveResource('client-1', {
        type: 'project',
        path: '/Users/test/myproject',
        activatedAt: Date.now(),
      });

      manager.clearActiveResource('client-1');

      expect(manager.getActiveResource('client-1')).toBeNull();
    });

    test('separates resources by client', () => {
      manager.setActiveResource('client-1', {
        type: 'file',
        path: '/a.txt',
        activatedAt: Date.now(),
      });
      manager.setActiveResource('client-2', {
        type: 'file',
        path: '/b.txt',
        activatedAt: Date.now(),
      });

      expect(manager.getActiveResource('client-1')?.path).toBe('/a.txt');
      expect(manager.getActiveResource('client-2')?.path).toBe('/b.txt');
    });

    test('replaces existing active resource', () => {
      manager.setActiveResource('client-1', {
        type: 'file',
        path: '/old.txt',
        activatedAt: Date.now(),
      });
      manager.setActiveResource('client-1', {
        type: 'file',
        path: '/new.txt',
        activatedAt: Date.now(),
      });

      expect(manager.getActiveResource('client-1')?.path).toBe('/new.txt');
    });
  });

  describe('Long-term memory (persisted key-value)', () => {
    test('sets and gets string value', async () => {
      await manager.memory.set('user.name', 'Jack');
      const value = await manager.memory.get('user.name');
      expect(value).toBe('Jack');
    });

    test('sets and gets number value', async () => {
      await manager.memory.set('preference.voice.speed', 1.2);
      const value = await manager.memory.get('preference.voice.speed');
      expect(value).toBe(1.2);
    });

    test('sets and gets boolean value', async () => {
      await manager.memory.set('preference.darkMode', true);
      const value = await manager.memory.get('preference.darkMode');
      expect(value).toBe(true);
    });

    test('returns null for non-existent key', async () => {
      const value = await manager.memory.get('nonexistent.key');
      expect(value).toBeNull();
    });

    test('overwrites existing value', async () => {
      await manager.memory.set('user.name', 'Jack');
      await manager.memory.set('user.name', 'John');
      const value = await manager.memory.get('user.name');
      expect(value).toBe('John');
    });

    test('deletes value', async () => {
      await manager.memory.set('user.name', 'Jack');
      await manager.memory.delete('user.name');
      const value = await manager.memory.get('user.name');
      expect(value).toBeNull();
    });

    test('gets all keys in namespace', async () => {
      await manager.memory.set('user.name', 'Jack');
      await manager.memory.set('user.email', 'jack@example.com');
      await manager.memory.set('user.age', 30);
      await manager.memory.set('preference.theme', 'dark');

      const userMemory = await manager.memory.getNamespace('user');

      expect(userMemory).toEqual({
        'user.name': 'Jack',
        'user.email': 'jack@example.com',
        'user.age': 30,
      });
    });

    test('returns empty object for empty namespace', async () => {
      const empty = await manager.memory.getNamespace('nonexistent');
      expect(empty).toEqual({});
    });

    test('persists across manager instances', async () => {
      await manager.memory.set('user.name', 'Jack');
      await manager.close();

      // Create new instance with same db
      const manager2 = new ContextManager({ dbPath: testDbPath });
      await manager2.initialize();

      const value = await manager2.memory.get('user.name');
      expect(value).toBe('Jack');

      await manager2.close();
    });

    test('lists all keys', async () => {
      await manager.memory.set('user.name', 'Jack');
      await manager.memory.set('preference.theme', 'dark');

      const keys = await manager.memory.keys();

      expect(keys).toContain('user.name');
      expect(keys).toContain('preference.theme');
    });

    test('clears all memory', async () => {
      await manager.memory.set('user.name', 'Jack');
      await manager.memory.set('preference.theme', 'dark');

      await manager.memory.clear();

      const keys = await manager.memory.keys();
      expect(keys).toHaveLength(0);
    });
  });

  describe('getSnapshot', () => {
    test('returns combined context snapshot', async () => {
      const intent: ParsedIntent = {
        id: 'i1',
        action: 'get_weather',
        parameters: {},
        dependencies: [],
      };

      manager.recordIntent('client-1', intent, { temp: 72 });
      manager.setActiveResource('client-1', {
        type: 'file',
        path: '/test.txt',
        activatedAt: Date.now(),
      });
      await manager.memory.set('user.name', 'Jack');
      await manager.memory.set('user.location', 'SF');

      const snapshot = await manager.getSnapshot('client-1', ['user']);

      expect(snapshot.recentIntents).toHaveLength(1);
      expect(snapshot.activeResource?.path).toBe('/test.txt');
      expect(snapshot.relevantMemory['user.name']).toBe('Jack');
      expect(snapshot.relevantMemory['user.location']).toBe('SF');
    });

    test('returns empty snapshot for new client', async () => {
      const snapshot = await manager.getSnapshot('new-client', []);

      expect(snapshot.recentIntents).toEqual([]);
      expect(snapshot.activeResource).toBeNull();
      expect(snapshot.relevantMemory).toEqual({});
    });
  });

  describe('client cleanup', () => {
    test('clears all client data on disconnect', async () => {
      manager.recordIntent('client-1', {
        id: 'i1',
        action: 'test',
        parameters: {},
        dependencies: [],
      }, {});
      manager.setActiveResource('client-1', {
        type: 'file',
        path: '/test.txt',
        activatedAt: Date.now(),
      });

      manager.clearClient('client-1');

      expect(manager.getRecentIntents('client-1')).toEqual([]);
      expect(manager.getActiveResource('client-1')).toBeNull();
      // Note: Long-term memory is NOT cleared (it's persistent)
    });
  });
});
