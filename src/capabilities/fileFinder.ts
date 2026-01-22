/**
 * FileFinder - Intelligently locates files
 *
 * Responsibilities:
 * - Find files at exact path
 * - Search common locations (Desktop, Documents, Downloads)
 * - Pattern matching by partial name or extension
 * - Cache results for faster lookups
 * - Track recently accessed files
 */

import { stat, readdir } from 'fs/promises';
import { join, basename, dirname, isAbsolute } from 'path';
import { homedir } from 'os';

export interface FileFinderOptions {
  homeDir?: string;
  searchLocations?: string[];
  maxRecentFiles?: number;
}

export interface FindOptions {
  skipCache?: boolean;
  searchSubdirs?: boolean;
  maxDepth?: number;
  includeInfo?: boolean;
}

export interface FileInfo {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  modifiedAt: Date;
  createdAt: Date;
}

export interface FileMatch {
  path: string;
  matchType: 'exact' | 'common_location' | 'pattern' | 'recent';
  info?: FileInfo;
}

export interface FindResult {
  found: boolean;
  path?: string;
  matchType?: 'exact' | 'common_location' | 'pattern' | 'recent';
  fromCache?: boolean;
  info?: FileInfo;
}

export interface FindAllResult {
  matches: FileMatch[];
  ambiguous: boolean;
}

export class FileFinder {
  private homeDir: string;
  private searchLocations: string[];
  private maxRecentFiles: number;

  private cache = new Map<string, string>();
  private recentFiles: string[] = [];

  constructor(options: FileFinderOptions = {}) {
    this.homeDir = options.homeDir || homedir();
    this.searchLocations = options.searchLocations || [
      join(this.homeDir, 'Desktop'),
      join(this.homeDir, 'Documents'),
      join(this.homeDir, 'Downloads'),
    ];
    this.maxRecentFiles = options.maxRecentFiles || 10;
  }

  /**
   * Find a single file, returning the first match.
   */
  async find(query: string, options: FindOptions = {}): Promise<FindResult> {
    const { skipCache = false, searchSubdirs = false, maxDepth = 3, includeInfo = false } = options;

    // Check cache first
    if (!skipCache && this.cache.has(query)) {
      const cachedPath = this.cache.get(query)!;
      const result: FindResult = {
        found: true,
        path: cachedPath,
        matchType: 'exact',
        fromCache: true,
      };
      if (includeInfo) {
        result.info = await this.getFileInfo(cachedPath);
      }
      return result;
    }

    // Try exact path first
    if (isAbsolute(query)) {
      const exists = await this.fileExists(query);
      if (exists) {
        this.cacheResult(query, query);
        this.trackRecent(query);
        const result: FindResult = {
          found: true,
          path: query,
          matchType: 'exact',
        };
        if (includeInfo) {
          result.info = await this.getFileInfo(query);
        }
        return result;
      }
      return { found: false };
    }

    // Check recent files first
    const recentMatch = await this.findInRecent(query);
    if (recentMatch) {
      this.cacheResult(query, recentMatch);
      const result: FindResult = {
        found: true,
        path: recentMatch,
        matchType: 'recent',
      };
      if (includeInfo) {
        result.info = await this.getFileInfo(recentMatch);
      }
      return result;
    }

    // Search common locations
    for (const location of this.searchLocations) {
      // Try exact filename in location
      const exactPath = join(location, query);
      if (await this.fileExists(exactPath)) {
        this.cacheResult(query, exactPath);
        this.trackRecent(exactPath);
        const result: FindResult = {
          found: true,
          path: exactPath,
          matchType: 'common_location',
        };
        if (includeInfo) {
          result.info = await this.getFileInfo(exactPath);
        }
        return result;
      }

      // Try case-insensitive match
      const caseInsensitiveMatch = await this.findCaseInsensitive(location, query);
      if (caseInsensitiveMatch) {
        this.cacheResult(query, caseInsensitiveMatch);
        this.trackRecent(caseInsensitiveMatch);
        const result: FindResult = {
          found: true,
          path: caseInsensitiveMatch,
          matchType: 'common_location',
        };
        if (includeInfo) {
          result.info = await this.getFileInfo(caseInsensitiveMatch);
        }
        return result;
      }
    }

    // Try pattern matching
    const patternMatch = await this.findByPattern(query, this.searchLocations, searchSubdirs, maxDepth);
    if (patternMatch) {
      this.cacheResult(query, patternMatch);
      this.trackRecent(patternMatch);
      const result: FindResult = {
        found: true,
        path: patternMatch,
        matchType: 'pattern',
      };
      if (includeInfo) {
        result.info = await this.getFileInfo(patternMatch);
      }
      return result;
    }

    return { found: false };
  }

  /**
   * Find all matching files (for ambiguity detection).
   */
  async findAll(query: string, options: FindOptions = {}): Promise<FindAllResult> {
    const { searchSubdirs = false, maxDepth = 3 } = options;
    const matches: FileMatch[] = [];
    const isPattern = query.includes('*');

    for (const location of this.searchLocations) {
      if (isPattern) {
        // Pattern search
        const patternMatches = await this.findAllByPattern(query, location, searchSubdirs, maxDepth);
        matches.push(...patternMatches.map((path) => ({ path, matchType: 'pattern' as const })));
      } else {
        // Exact name search
        const exactPath = join(location, query);
        if (await this.fileExists(exactPath)) {
          matches.push({ path: exactPath, matchType: 'common_location' });
        } else {
          // Case insensitive
          const caseMatch = await this.findCaseInsensitive(location, query);
          if (caseMatch) {
            matches.push({ path: caseMatch, matchType: 'common_location' });
          }
        }
      }
    }

    return {
      matches,
      ambiguous: matches.length > 1,
    };
  }

  /**
   * Clear cache for a specific query.
   */
  clearCache(query: string): void {
    this.cache.delete(query);
  }

  /**
   * Clear entire cache.
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Get list of recently accessed files.
   */
  getRecentFiles(): string[] {
    return [...this.recentFiles];
  }

  // Private helpers

  private async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private async getFileInfo(path: string): Promise<FileInfo | undefined> {
    try {
      const stats = await stat(path);
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        modifiedAt: stats.mtime,
        createdAt: stats.birthtime,
      };
    } catch {
      return undefined;
    }
  }

  private cacheResult(query: string, path: string): void {
    this.cache.set(query, path);
  }

  private trackRecent(path: string): void {
    // Remove if already in list
    const index = this.recentFiles.indexOf(path);
    if (index !== -1) {
      this.recentFiles.splice(index, 1);
    }

    // Add to front
    this.recentFiles.unshift(path);

    // Trim to max
    if (this.recentFiles.length > this.maxRecentFiles) {
      this.recentFiles = this.recentFiles.slice(0, this.maxRecentFiles);
    }
  }

  private async findInRecent(query: string): Promise<string | null> {
    const queryLower = query.toLowerCase();
    for (const path of this.recentFiles) {
      const filename = basename(path).toLowerCase();
      if (filename === queryLower || filename.includes(queryLower)) {
        if (await this.fileExists(path)) {
          return path;
        }
      }
    }
    return null;
  }

  private async findCaseInsensitive(dir: string, filename: string): Promise<string | null> {
    try {
      const entries = await readdir(dir);
      const filenameLower = filename.toLowerCase();
      for (const entry of entries) {
        if (entry.toLowerCase() === filenameLower) {
          return join(dir, entry);
        }
      }
    } catch {
      // Directory might not exist
    }
    return null;
  }

  private async findByPattern(
    pattern: string,
    locations: string[],
    searchSubdirs: boolean,
    maxDepth: number
  ): Promise<string | null> {
    for (const location of locations) {
      const match = await this.searchDirectory(location, pattern, searchSubdirs, maxDepth, 0);
      if (match) {
        return match;
      }
    }
    return null;
  }

  private async findAllByPattern(
    pattern: string,
    location: string,
    searchSubdirs: boolean,
    maxDepth: number
  ): Promise<string[]> {
    const matches: string[] = [];
    await this.collectMatches(location, pattern, searchSubdirs, maxDepth, 0, matches);
    return matches;
  }

  private async searchDirectory(
    dir: string,
    pattern: string,
    searchSubdirs: boolean,
    maxDepth: number,
    currentDepth: number
  ): Promise<string | null> {
    if (currentDepth > maxDepth) {
      return null;
    }

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isFile()) {
          if (this.matchesPattern(entry.name, pattern)) {
            return fullPath;
          }
        } else if (entry.isDirectory() && searchSubdirs) {
          const subMatch = await this.searchDirectory(
            fullPath,
            pattern,
            searchSubdirs,
            maxDepth,
            currentDepth + 1
          );
          if (subMatch) {
            return subMatch;
          }
        }
      }
    } catch {
      // Directory access error
    }

    return null;
  }

  private async collectMatches(
    dir: string,
    pattern: string,
    searchSubdirs: boolean,
    maxDepth: number,
    currentDepth: number,
    matches: string[]
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isFile()) {
          if (this.matchesPattern(entry.name, pattern)) {
            matches.push(fullPath);
          }
        } else if (entry.isDirectory() && searchSubdirs) {
          await this.collectMatches(fullPath, pattern, searchSubdirs, maxDepth, currentDepth + 1, matches);
        }
      }
    } catch {
      // Directory access error
    }
  }

  private matchesPattern(filename: string, pattern: string): boolean {
    const filenameLower = filename.toLowerCase();
    const patternLower = pattern.toLowerCase();

    // Wildcard pattern
    if (patternLower.includes('*')) {
      const regex = new RegExp(
        '^' + patternLower.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return regex.test(filenameLower);
    }

    // Partial match (filename contains pattern)
    return filenameLower.includes(patternLower);
  }
}
