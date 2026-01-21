import Database from 'better-sqlite3';
import { Memory } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface MemorySearchCriteria {
  topic?: string;
  tags?: string;
  keyword?: string;
}

/**
 * Persistent Memory Store using SQLite
 * Stores and retrieves important information from conversations
 */
export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure database directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeDatabase();
    logger.info(`Memory store initialized at ${dbPath}`);
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        importance INTEGER NOT NULL,
        metadata TEXT,
        tags TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_topic ON memories(topic);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
    `);
  }

  /**
   * Store a new memory
   */
  store(memory: Omit<Memory, 'id' | 'timestamp'> & { timestamp?: string }): Memory {
    const timestamp = memory.timestamp || new Date().toISOString();
    const metadata = memory.metadata ? JSON.stringify(memory.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO memories (timestamp, topic, content, importance, metadata, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      timestamp,
      memory.topic,
      memory.content,
      memory.importance,
      metadata,
      memory.tags || null
    );

    logger.debug(`Stored memory #${info.lastInsertRowid}: ${memory.topic}`);

    return {
      id: Number(info.lastInsertRowid),
      timestamp,
      topic: memory.topic,
      content: memory.content,
      importance: memory.importance,
      metadata: memory.metadata,
      tags: memory.tags,
    };
  }

  /**
   * Retrieve a memory by ID
   */
  retrieve(id: number): Memory | null {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return this.rowToMemory(row);
  }

  /**
   * Search memories by criteria
   */
  search(criteria: MemorySearchCriteria = {}, limit = 100): Memory[] {
    let query = 'SELECT * FROM memories WHERE 1=1';
    const params: any[] = [];

    if (criteria.topic) {
      query += ' AND topic = ?';
      params.push(criteria.topic);
    }

    if (criteria.tags) {
      query += ' AND tags LIKE ?';
      params.push(`%${criteria.tags}%`);
    }

    if (criteria.keyword) {
      query += ' AND content LIKE ?';
      params.push(`%${criteria.keyword}%`);
    }

    // Order by importance (descending) and then by timestamp (descending)
    query += ' ORDER BY importance DESC, timestamp DESC';
    query += ' LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.rowToMemory(row));
  }

  /**
   * Get all memories
   */
  getAll(limit = 1000): Memory[] {
    const stmt = this.db.prepare(
      'SELECT * FROM memories ORDER BY importance DESC, timestamp DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as any[];
    return rows.map((row) => this.rowToMemory(row));
  }

  /**
   * Delete a memory by ID
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Get total count of memories
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM memories');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get recent memories
   */
  getRecent(limit = 10): Memory[] {
    const stmt = this.db.prepare(
      'SELECT * FROM memories ORDER BY timestamp DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as any[];
    return rows.map((row) => this.rowToMemory(row));
  }

  /**
   * Get memories by importance threshold
   */
  getByImportance(minImportance: number, limit = 50): Memory[] {
    const stmt = this.db.prepare(
      'SELECT * FROM memories WHERE importance >= ? ORDER BY importance DESC, timestamp DESC LIMIT ?'
    );
    const rows = stmt.all(minImportance, limit) as any[];
    return rows.map((row) => this.rowToMemory(row));
  }

  /**
   * Clear all memories (use with caution!)
   */
  clear(): void {
    this.db.exec('DELETE FROM memories');
    logger.warn('All memories have been cleared');
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    logger.info('Memory store closed');
  }

  /**
   * Convert database row to Memory object
   */
  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      timestamp: row.timestamp,
      topic: row.topic,
      content: row.content,
      importance: row.importance,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      tags: row.tags || undefined,
    };
  }
}
