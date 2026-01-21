import { CacheEntry } from '../types/index.js';

/**
 * Simple in-memory cache with TTL support
 */
export class Cache<T> {
  private store: Map<string, CacheEntry<T>>;

  constructor() {
    this.store = new Map();
  }

  /**
   * Set a cache entry with TTL in milliseconds
   */
  set(key: string, data: T, ttl: number): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Get a cache entry if it exists and hasn't expired
   */
  get(key: string): T | null {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Check if a key exists and is valid
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.store.delete(key);
        removed++;
      }
    }

    return removed;
  }
}
