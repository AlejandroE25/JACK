/**
 * ContextManager - Three-tier context system
 *
 * 1. Short-term: Recent intents (3 turns or 60 seconds)
 *    - In-memory, per-client
 *    - Used for follow-up resolution
 *
 * 2. Session: Active resources (until disconnect)
 *    - In-memory, per-client
 *    - Current file, project, conversation being worked on
 *
 * 3. Long-term: Persisted key-value memory (SQLite)
 *    - Namespaced: user.*, preference.*, project.*, person.*, tool.*
 *    - No NLP on retrieval - direct key lookup
 *    - Survives restarts
 */

import { Database } from 'bun:sqlite';
import type {
  ParsedIntent,
  RecentIntent,
  ActiveResource,
  MemoryValue,
  ContextSnapshot,
} from '../types';

const MAX_RECENT_INTENTS = 3;
const INTENT_EXPIRY_MS = 60_000; // 60 seconds

export interface ContextManagerConfig {
  dbPath: string;
}

export class ContextManager {
  private db: Database | null = null;
  private recentIntents = new Map<string, RecentIntent[]>();
  private activeResources = new Map<string, ActiveResource>();

  public memory: Memory;

  constructor(private config: ContextManagerConfig) {
    this.memory = new Memory(() => this.db);
  }

  /**
   * Initialize the context manager (opens SQLite database)
   */
  async initialize(): Promise<void> {
    this.db = new Database(this.config.dbPath);

    // Create memory table if not exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Close the context manager (closes SQLite database)
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ============================================
  // Short-term context (recent intents)
  // ============================================

  /**
   * Record an intent and its result for a client.
   */
  recordIntent(clientId: string, intent: ParsedIntent, result: unknown): void {
    const intents = this.recentIntents.get(clientId) || [];

    // Add to front (most recent first)
    intents.unshift({
      intent,
      result,
      timestamp: Date.now(),
    });

    // Keep only MAX_RECENT_INTENTS
    if (intents.length > MAX_RECENT_INTENTS) {
      intents.length = MAX_RECENT_INTENTS;
    }

    this.recentIntents.set(clientId, intents);
  }

  /**
   * Get recent intents for a client (filtered by expiry).
   */
  getRecentIntents(clientId: string): RecentIntent[] {
    const intents = this.recentIntents.get(clientId) || [];
    const now = Date.now();

    // Filter out expired intents
    const valid = intents.filter((i) => now - i.timestamp < INTENT_EXPIRY_MS);

    // Update stored list to remove expired
    if (valid.length !== intents.length) {
      this.recentIntents.set(clientId, valid);
    }

    return valid;
  }

  /**
   * Clear recent intents for a client.
   */
  clearRecentIntents(clientId: string): void {
    this.recentIntents.delete(clientId);
  }

  // ============================================
  // Session context (active resource)
  // ============================================

  /**
   * Set the active resource for a client.
   */
  setActiveResource(clientId: string, resource: ActiveResource): void {
    this.activeResources.set(clientId, resource);
  }

  /**
   * Get the active resource for a client.
   */
  getActiveResource(clientId: string): ActiveResource | null {
    return this.activeResources.get(clientId) || null;
  }

  /**
   * Clear the active resource for a client.
   */
  clearActiveResource(clientId: string): void {
    this.activeResources.delete(clientId);
  }

  // ============================================
  // Combined operations
  // ============================================

  /**
   * Get a snapshot of all context for a client.
   *
   * @param clientId - Client ID
   * @param memoryNamespaces - Which memory namespaces to include
   */
  async getSnapshot(
    clientId: string,
    memoryNamespaces: string[]
  ): Promise<ContextSnapshot> {
    const relevantMemory: Record<string, MemoryValue> = {};

    for (const ns of memoryNamespaces) {
      const nsMemory = await this.memory.getNamespace(ns);
      Object.assign(relevantMemory, nsMemory);
    }

    return {
      recentIntents: this.getRecentIntents(clientId),
      activeResource: this.getActiveResource(clientId),
      relevantMemory,
    };
  }

  /**
   * Clear all session data for a client (on disconnect).
   * Does NOT clear long-term memory.
   */
  clearClient(clientId: string): void {
    this.clearRecentIntents(clientId);
    this.clearActiveResource(clientId);
  }
}

/**
 * Memory - Long-term key-value storage backed by SQLite
 *
 * Keys are namespaced: user.name, preference.theme, project.myapp.path
 * Values are primitives: string, number, boolean, null
 */
class Memory {
  constructor(private getDb: () => Database | null) {}

  private get db(): Database {
    const db = this.getDb();
    if (!db) {
      throw new Error('Database not initialized');
    }
    return db;
  }

  /**
   * Get a value by key.
   */
  async get(key: string): Promise<MemoryValue> {
    const row = this.db
      .query<{ value: string; type: string }, [string]>(
        'SELECT value, type FROM memory WHERE key = ?'
      )
      .get(key);

    if (!row) return null;

    return this.deserialize(row.value, row.type);
  }

  /**
   * Set a value by key.
   */
  async set(key: string, value: MemoryValue): Promise<void> {
    const { serialized, type } = this.serialize(value);

    this.db.run(
      `INSERT OR REPLACE INTO memory (key, value, type, updated_at) VALUES (?, ?, ?, ?)`,
      [key, serialized, type, Date.now()]
    );
  }

  /**
   * Delete a value by key.
   */
  async delete(key: string): Promise<void> {
    this.db.run('DELETE FROM memory WHERE key = ?', [key]);
  }

  /**
   * Get all key-value pairs in a namespace.
   */
  async getNamespace(prefix: string): Promise<Record<string, MemoryValue>> {
    const rows = this.db
      .query<{ key: string; value: string; type: string }, [string]>(
        'SELECT key, value, type FROM memory WHERE key LIKE ?'
      )
      .all(`${prefix}.%`);

    const result: Record<string, MemoryValue> = {};
    for (const row of rows) {
      result[row.key] = this.deserialize(row.value, row.type);
    }

    return result;
  }

  /**
   * Get all keys.
   */
  async keys(): Promise<string[]> {
    const rows = this.db
      .query<{ key: string }, []>('SELECT key FROM memory')
      .all();

    return rows.map((r) => r.key);
  }

  /**
   * Clear all memory.
   */
  async clear(): Promise<void> {
    this.db.run('DELETE FROM memory');
  }

  /**
   * Serialize a value for storage.
   */
  private serialize(value: MemoryValue): { serialized: string; type: string } {
    if (value === null) {
      return { serialized: 'null', type: 'null' };
    }
    if (typeof value === 'boolean') {
      return { serialized: value ? 'true' : 'false', type: 'boolean' };
    }
    if (typeof value === 'number') {
      return { serialized: String(value), type: 'number' };
    }
    return { serialized: value, type: 'string' };
  }

  /**
   * Deserialize a value from storage.
   */
  private deserialize(serialized: string, type: string): MemoryValue {
    switch (type) {
      case 'null':
        return null;
      case 'boolean':
        return serialized === 'true';
      case 'number':
        return Number(serialized);
      default:
        return serialized;
    }
  }
}
