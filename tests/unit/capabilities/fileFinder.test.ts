import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { FileFinder, type FileFinderOptions, type FileMatch } from '../../../src/capabilities/fileFinder';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileFinder', () => {
  let finder: FileFinder;
  let testDir: string;
  let desktopDir: string;
  let documentsDir: string;
  let downloadsDir: string;

  beforeEach(async () => {
    // Create temp test structure
    testDir = join(tmpdir(), `jack-filefinder-test-${Date.now()}`);
    desktopDir = join(testDir, 'Desktop');
    documentsDir = join(testDir, 'Documents');
    downloadsDir = join(testDir, 'Downloads');

    await mkdir(testDir, { recursive: true });
    await mkdir(desktopDir, { recursive: true });
    await mkdir(documentsDir, { recursive: true });
    await mkdir(downloadsDir, { recursive: true });

    const options: FileFinderOptions = {
      homeDir: testDir,
      searchLocations: [desktopDir, documentsDir, downloadsDir],
    };

    finder = new FileFinder(options);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('exact path lookup', () => {
    test('finds file at exact path', async () => {
      const filePath = join(desktopDir, 'report.pdf');
      await writeFile(filePath, 'test content');

      const result = await finder.find(filePath);

      expect(result.found).toBe(true);
      expect(result.path).toBe(filePath);
      expect(result.matchType).toBe('exact');
    });

    test('returns not found for non-existent exact path', async () => {
      const result = await finder.find('/nonexistent/path/file.txt');

      expect(result.found).toBe(false);
      expect(result.path).toBeUndefined();
    });

    test('finds directory at exact path', async () => {
      const result = await finder.find(desktopDir);

      expect(result.found).toBe(true);
      expect(result.path).toBe(desktopDir);
    });
  });

  describe('common locations search', () => {
    test('finds file in Desktop when given just filename', async () => {
      const filePath = join(desktopDir, 'report.pdf');
      await writeFile(filePath, 'content');

      const result = await finder.find('report.pdf');

      expect(result.found).toBe(true);
      expect(result.path).toBe(filePath);
      expect(result.matchType).toBe('common_location');
    });

    test('finds file in Documents when not on Desktop', async () => {
      const filePath = join(documentsDir, 'notes.txt');
      await writeFile(filePath, 'content');

      const result = await finder.find('notes.txt');

      expect(result.found).toBe(true);
      expect(result.path).toBe(filePath);
    });

    test('finds file in Downloads when not in other locations', async () => {
      const filePath = join(downloadsDir, 'download.zip');
      await writeFile(filePath, 'content');

      const result = await finder.find('download.zip');

      expect(result.found).toBe(true);
      expect(result.path).toBe(filePath);
    });

    test('prefers Desktop over Documents when file exists in both', async () => {
      await writeFile(join(desktopDir, 'shared.txt'), 'desktop');
      await writeFile(join(documentsDir, 'shared.txt'), 'documents');

      const result = await finder.find('shared.txt');

      expect(result.found).toBe(true);
      expect(result.path).toBe(join(desktopDir, 'shared.txt'));
    });
  });

  describe('pattern matching', () => {
    test('finds file by partial name', async () => {
      await writeFile(join(desktopDir, 'quarterly_report_2024.pdf'), 'content');

      const result = await finder.find('quarterly_report');

      expect(result.found).toBe(true);
      expect(result.path).toContain('quarterly_report_2024.pdf');
    });

    test('finds file by extension pattern', async () => {
      await writeFile(join(desktopDir, 'data.csv'), 'content');

      const result = await finder.find('*.csv');

      expect(result.found).toBe(true);
      expect(result.path).toContain('data.csv');
    });

    test('finds multiple matches with pattern', async () => {
      await writeFile(join(desktopDir, 'report_jan.pdf'), 'content');
      await writeFile(join(desktopDir, 'report_feb.pdf'), 'content');

      const result = await finder.findAll('report_*.pdf');

      expect(result.matches).toHaveLength(2);
      expect(result.matches.map((m) => m.path)).toContain(join(desktopDir, 'report_jan.pdf'));
      expect(result.matches.map((m) => m.path)).toContain(join(desktopDir, 'report_feb.pdf'));
    });

    test('returns no matches for pattern with no hits', async () => {
      const result = await finder.findAll('*.xyz');

      expect(result.matches).toHaveLength(0);
    });
  });

  describe('case insensitivity', () => {
    test('finds file with different case', async () => {
      await writeFile(join(desktopDir, 'Report.PDF'), 'content');

      const result = await finder.find('report.pdf');

      expect(result.found).toBe(true);
    });

    test('finds file with mixed case pattern', async () => {
      await writeFile(join(desktopDir, 'MyDocument.txt'), 'content');

      const result = await finder.find('mydocument.txt');

      expect(result.found).toBe(true);
    });
  });

  describe('caching', () => {
    test('caches successful lookups', async () => {
      const filePath = join(desktopDir, 'cached.txt');
      await writeFile(filePath, 'content');

      // First lookup
      await finder.find('cached.txt');

      // Delete the file
      await rm(filePath);

      // Second lookup should still find it from cache
      const result = await finder.find('cached.txt');
      expect(result.found).toBe(true);
      expect(result.fromCache).toBe(true);
    });

    test('clears cache for specific file', async () => {
      const filePath = join(desktopDir, 'cached.txt');
      await writeFile(filePath, 'content');

      await finder.find('cached.txt');
      await rm(filePath);

      finder.clearCache('cached.txt');

      const result = await finder.find('cached.txt');
      expect(result.found).toBe(false);
    });

    test('clears entire cache', async () => {
      await writeFile(join(desktopDir, 'file1.txt'), 'content');
      await writeFile(join(desktopDir, 'file2.txt'), 'content');

      await finder.find('file1.txt');
      await finder.find('file2.txt');

      await rm(join(desktopDir, 'file1.txt'));
      await rm(join(desktopDir, 'file2.txt'));

      finder.clearAllCache();

      expect((await finder.find('file1.txt')).found).toBe(false);
      expect((await finder.find('file2.txt')).found).toBe(false);
    });

    test('bypasses cache when requested', async () => {
      const filePath = join(desktopDir, 'cached.txt');
      await writeFile(filePath, 'content');

      await finder.find('cached.txt');
      await rm(filePath);

      const result = await finder.find('cached.txt', { skipCache: true });
      expect(result.found).toBe(false);
    });
  });

  describe('ambiguous results', () => {
    test('returns ambiguous flag when multiple matches found', async () => {
      await writeFile(join(desktopDir, 'report.txt'), 'desktop');
      await writeFile(join(documentsDir, 'report.txt'), 'documents');

      // Force non-preferential search
      const result = await finder.findAll('report.txt');

      expect(result.ambiguous).toBe(true);
      expect(result.matches).toHaveLength(2);
    });

    test('includes all matches in ambiguous result', async () => {
      await writeFile(join(desktopDir, 'data.json'), 'desktop');
      await writeFile(join(documentsDir, 'data.json'), 'documents');
      await writeFile(join(downloadsDir, 'data.json'), 'downloads');

      const result = await finder.findAll('data.json');

      expect(result.ambiguous).toBe(true);
      expect(result.matches).toHaveLength(3);
    });
  });

  describe('recent files tracking', () => {
    test('tracks recently found files', async () => {
      await writeFile(join(desktopDir, 'recent1.txt'), 'content');
      await writeFile(join(documentsDir, 'recent2.txt'), 'content');

      await finder.find('recent1.txt');
      await finder.find('recent2.txt');

      const recent = finder.getRecentFiles();

      expect(recent).toHaveLength(2);
    });

    test('limits recent files to configured max', async () => {
      const customFinder = new FileFinder({
        homeDir: testDir,
        searchLocations: [desktopDir],
        maxRecentFiles: 2,
      });

      await writeFile(join(desktopDir, 'file1.txt'), 'content');
      await writeFile(join(desktopDir, 'file2.txt'), 'content');
      await writeFile(join(desktopDir, 'file3.txt'), 'content');

      await customFinder.find('file1.txt');
      await customFinder.find('file2.txt');
      await customFinder.find('file3.txt');

      const recent = customFinder.getRecentFiles();
      expect(recent).toHaveLength(2);
    });

    test('prioritizes recent files in search', async () => {
      // Create file in less-preferred location
      await writeFile(join(downloadsDir, 'priority.txt'), 'content');

      // Access it to add to recent
      await finder.find(join(downloadsDir, 'priority.txt'));

      // Clear cache so we re-search
      finder.clearAllCache();

      // Now search by name - should find in recent first
      const result = await finder.find('priority.txt');
      expect(result.found).toBe(true);
      expect(result.path).toBe(join(downloadsDir, 'priority.txt'));
    });
  });

  describe('subdirectory search', () => {
    test('searches subdirectories when enabled', async () => {
      const subDir = join(desktopDir, 'projects', 'myproject');
      await mkdir(subDir, { recursive: true });
      await writeFile(join(subDir, 'readme.md'), 'content');

      const result = await finder.find('readme.md', { searchSubdirs: true });

      expect(result.found).toBe(true);
      expect(result.path).toContain('projects/myproject/readme.md');
    });

    test('limits subdirectory search depth', async () => {
      const deepDir = join(desktopDir, 'a', 'b', 'c', 'd', 'e');
      await mkdir(deepDir, { recursive: true });
      await writeFile(join(deepDir, 'deep.txt'), 'content');

      const result = await finder.find('deep.txt', { searchSubdirs: true, maxDepth: 2 });

      expect(result.found).toBe(false);
    });
  });

  describe('file info', () => {
    test('returns file metadata when requested', async () => {
      const filePath = join(desktopDir, 'info.txt');
      await writeFile(filePath, 'test content here');

      const result = await finder.find('info.txt', { includeInfo: true });

      expect(result.found).toBe(true);
      expect(result.info).toBeDefined();
      expect(result.info?.size).toBeGreaterThan(0);
      expect(result.info?.isFile).toBe(true);
      expect(result.info?.isDirectory).toBe(false);
    });

    test('returns directory metadata', async () => {
      const result = await finder.find(desktopDir, { includeInfo: true });

      expect(result.info?.isDirectory).toBe(true);
      expect(result.info?.isFile).toBe(false);
    });
  });
});
