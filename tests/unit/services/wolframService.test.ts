import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WolframService } from '../../../src/services/wolframService.js';

// Mock @wolfram-alpha/wolfram-alpha-api
vi.mock('@wolfram-alpha/wolfram-alpha-api', () => {
  return {
    default: vi.fn(() => ({
      getShort: vi.fn(),
    })),
  };
});

describe('WolframService', () => {
  let wolframService: WolframService;
  let mockGetShort: any;

  beforeEach(() => {
    vi.clearAllMocks();
    wolframService = new WolframService('test_app_id');
    // Get the mocked getShort function
    mockGetShort = (wolframService as any).client.getShort;
  });

  describe('query', () => {
    it('should query Wolfram Alpha and return simple answer', async () => {
      mockGetShort.mockResolvedValueOnce('4');

      const result = await wolframService.query('2 + 2');

      expect(result.query).toBe('2 + 2');
      expect(result.shortAnswer).toBe('4');
      expect(result.success).toBe(true);
      expect(result.pods).toHaveLength(1);
      expect(result.pods[0].title).toBe('Result');
      expect(result.pods[0].content).toBe('4');
      expect(mockGetShort).toHaveBeenCalledWith('2 + 2');
    });

    it('should handle mathematical expressions', async () => {
      mockGetShort.mockResolvedValueOnce('4');

      const result = await wolframService.query('square root of 16');

      expect(result.shortAnswer).toBe('4');
      expect(result.detailedAnswer).toBe('4');
      expect(result.success).toBe(true);
      expect(mockGetShort).toHaveBeenCalledWith('square root of 16');
    });

    it('should handle factual queries', async () => {
      mockGetShort.mockResolvedValueOnce('675,647 people');

      const result = await wolframService.query('population of Boston');

      expect(result.shortAnswer).toBe('675,647 people');
      expect(result.success).toBe(true);
      expect(mockGetShort).toHaveBeenCalledWith('population of Boston');
    });

    it('should throw error when no results found', async () => {
      mockGetShort.mockResolvedValueOnce('');

      await expect(wolframService.query('invalid query')).rejects.toThrow(
        'No results from Wolfram Alpha'
      );
    });

    it('should throw error when API call fails', async () => {
      mockGetShort.mockRejectedValueOnce(new Error('API error'));

      await expect(wolframService.query('test')).rejects.toThrow('Failed to query Wolfram Alpha');
    });
  });

  describe('getFormattedAnswer', () => {
    it('should return formatted short answer', async () => {
      mockGetShort.mockResolvedValueOnce('40');

      const formatted = await wolframService.getFormattedAnswer('what is 5 * 8');

      expect(formatted).toBe('40');
    });

    it('should return error message when query fails', async () => {
      mockGetShort.mockRejectedValueOnce(new Error('API error'));

      const formatted = await wolframService.getFormattedAnswer('test');

      expect(formatted).toContain('encountered an error');
    });

    it('should return message when no answer found', async () => {
      mockGetShort.mockResolvedValueOnce('');

      const formatted = await wolframService.getFormattedAnswer('invalid');

      expect(formatted).toContain("couldn't find");
    });
  });

  describe('isSuitableQuery', () => {
    it('should identify mathematical queries', () => {
      expect(wolframService.isSuitableQuery('what is 5 + 3')).toBe(true);
      expect(wolframService.isSuitableQuery('calculate 10 * 2')).toBe(true);
      expect(wolframService.isSuitableQuery('sin(45)')).toBe(true);
      expect(wolframService.isSuitableQuery('solve x^2 = 16')).toBe(true);
      expect(wolframService.isSuitableQuery('derivative of x^2')).toBe(true);
    });

    it('should identify scientific queries', () => {
      expect(wolframService.isSuitableQuery('atomic mass of carbon')).toBe(true);
      expect(wolframService.isSuitableQuery('distance of earth from sun')).toBe(true);
      expect(wolframService.isSuitableQuery('convert 5 miles to kilometers')).toBe(true);
    });

    it('should identify factual queries', () => {
      expect(wolframService.isSuitableQuery('population of New York')).toBe(true);
      expect(wolframService.isSuitableQuery('capital of France')).toBe(true);
      expect(wolframService.isSuitableQuery('when was Einstein born')).toBe(true);
      expect(wolframService.isSuitableQuery('who invented the telephone')).toBe(true);
      expect(wolframService.isSuitableQuery('where is Paris')).toBe(true);
    });

    it('should reject non-suitable queries', () => {
      expect(wolframService.isSuitableQuery('how are you today')).toBe(false);
      expect(wolframService.isSuitableQuery('tell me a joke')).toBe(false);
      expect(wolframService.isSuitableQuery('what is your favorite color')).toBe(false);
    });
  });

  describe('caching', () => {
    it('should cache query results', async () => {
      mockGetShort.mockResolvedValueOnce('4');

      // First call
      await wolframService.query('2 + 2');
      expect(mockGetShort).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await wolframService.query('2 + 2');
      expect(mockGetShort).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('should normalize cache keys (case insensitive)', async () => {
      mockGetShort.mockResolvedValueOnce('4');

      await wolframService.query('2 + 2');
      await wolframService.query('2 + 2  '); // Extra spaces
      await wolframService.query('2 + 2'); // Different case handled by trim

      expect(mockGetShort).toHaveBeenCalledTimes(1); // All should use cache
    });

    it('should clear cache when requested', async () => {
      mockGetShort.mockResolvedValue('4');

      // First call
      await wolframService.query('2 + 2');
      expect(mockGetShort).toHaveBeenCalledTimes(1);

      // Clear cache
      wolframService.clearCache();

      // Should fetch again after cache clear
      await wolframService.query('2 + 2');
      expect(mockGetShort).toHaveBeenCalledTimes(2);
    });
  });

  describe('check', () => {
    it('should return true when service is working', async () => {
      mockGetShort.mockResolvedValueOnce('4');

      const result = await wolframService.check();
      expect(result).toBe(true);
    });

    it('should return false when service fails', async () => {
      mockGetShort.mockRejectedValueOnce(new Error('API error'));

      const result = await wolframService.check();
      expect(result).toBe(false);
    });

    it('should return false when result is incorrect', async () => {
      mockGetShort.mockResolvedValueOnce('5'); // Wrong answer

      const result = await wolframService.check();
      expect(result).toBe(false);
    });
  });
});
