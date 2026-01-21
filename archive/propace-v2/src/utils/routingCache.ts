import { RoutingCacheEntry, SubsystemType } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Specialized cache for routing decisions with LRU eviction
 * Optimized for fast lookups and memory efficiency
 */
export class RoutingCache {
  private cache: Map<string, RoutingCacheEntry>;
  private ttl: number;
  private maxSize: number;

  constructor(ttl: number = 300000, maxSize: number = 1000) {
    this.cache = new Map();
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  /**
   * Normalize message for consistent cache keys
   */
  private normalizeKey(message: string): string {
    return message
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[?!.]+$/, ''); // Remove trailing punctuation
  }

  /**
   * Get routing decision from cache
   */
  get(message: string): RoutingCacheEntry | null {
    const key = this.normalizeKey(message);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Increment hit count
    entry.hitCount++;

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    logger.debug(`Routing cache HIT for: ${key}`);
    return entry;
  }

  /**
   * Set routing decision in cache
   */
  set(message: string, subsystem: SubsystemType, confidence: number): void {
    const key = this.normalizeKey(message);

    // LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        logger.debug(`Routing cache evicted: ${firstKey}`);
      }
    }

    const entry: RoutingCacheEntry = {
      subsystem,
      confidence,
      timestamp: Date.now(),
      hitCount: 0,
    };

    this.cache.set(key, entry);
    logger.debug(`Routing cache SET: ${key} → ${subsystem} (${confidence})`);
  }

  /**
   * Check if message has similar cached entry
   * Uses simple keyword overlap for fast similarity check
   */
  findSimilar(message: string, threshold: number = 0.7): RoutingCacheEntry | null {
    const normalized = this.normalizeKey(message);
    const words = new Set(normalized.split(' '));

    let bestMatch: { entry: RoutingCacheEntry; similarity: number } | null = null;

    for (const [cachedKey, entry] of this.cache.entries()) {
      // Skip expired entries
      if (Date.now() - entry.timestamp > this.ttl) {
        continue;
      }

      const cachedWords = new Set(cachedKey.split(' '));
      const intersection = new Set([...words].filter((w) => cachedWords.has(w)));
      const union = new Set([...words, ...cachedWords]);
      const similarity = intersection.size / union.size;

      if (similarity >= threshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { entry, similarity };
        }
      }
    }

    if (bestMatch) {
      logger.debug(
        `Routing cache SIMILAR match (${bestMatch.similarity.toFixed(2)}): ${bestMatch.entry.subsystem}`
      );
      bestMatch.entry.hitCount++;
      return bestMatch.entry;
    }

    return null;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    logger.debug('Routing cache cleared');
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`Routing cache cleaned ${count} expired entries`);
    }

    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; subsystem: SubsystemType; hits: number }>;
  } {
    const entries: Array<{ key: string; subsystem: SubsystemType; hits: number }> = [];
    let totalHits = 0;
    let totalEntries = 0;

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key,
        subsystem: entry.subsystem,
        hits: entry.hitCount,
      });
      totalHits += entry.hitCount;
      totalEntries++;
    }

    // Sort by hit count descending
    entries.sort((a, b) => b.hits - a.hits);

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalEntries > 0 ? totalHits / totalEntries : 0,
      entries,
    };
  }
}
