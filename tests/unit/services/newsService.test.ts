import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NewsService } from '../../../src/services/newsService.js';

// Mock rss-parser - mock the constructor and instance methods
const mockParseURL = vi.fn();
vi.mock('rss-parser', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      parseURL: mockParseURL,
    })),
  };
});

describe('NewsService', () => {
  let newsService: NewsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseURL.mockReset();
    newsService = new NewsService();
  });

  describe('getNews', () => {
    it('should fetch and parse Atom feed from Wikinews', async () => {
      // Mock the parsed feed structure that rss-parser returns from Atom feed
      // Based on actual Wikinews feed structure
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'Four countries back out of Eurovision 2026 amid ongoing boycott',
            link: 'https://en.wikinews.org/wiki/Four_countries_back_out_of_Eurovision_2026_amid_ongoing_boycott',
            isoDate: '2025-12-10T19:45:32Z',
          },
          {
            title: 'Robert Dick and Mark Dresser re-unite at the Fridman Gallery',
            link: 'https://en.wikinews.org/wiki/Robert_Dick_and_Mark_Dresser_re-unite_at_the_Fridman_Gallery',
            isoDate: '2025-12-10T14:41:34Z',
          },
        ],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const news = await newsService.getNews();

      expect(news).toHaveLength(2);
      expect(news[0]).toEqual({
        title: 'Four countries back out of Eurovision 2026 amid ongoing boycott',
        link: 'https://en.wikinews.org/wiki/Four_countries_back_out_of_Eurovision_2026_amid_ongoing_boycott',
        published: '2025-12-10T19:45:32Z',
      });
      expect(news[1]).toEqual({
        title: 'Robert Dick and Mark Dresser re-unite at the Fridman Gallery',
        link: 'https://en.wikinews.org/wiki/Robert_Dick_and_Mark_Dresser_re-unite_at_the_Fridman_Gallery',
        published: '2025-12-10T14:41:34Z',
      });
    });

    it('should return cached news on subsequent calls', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'Cached News',
            link: 'https://en.wikinews.org/wiki/Cached',
            isoDate: '2025-12-10T10:00:00Z',
          },
        ],
      };

      mockParseURL.mockResolvedValue(mockFeedOutput as any);

      // First call - should fetch
      const firstNews = await newsService.getNews();
      expect(mockParseURL).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const secondNews = await newsService.getNews();
      expect(mockParseURL).toHaveBeenCalledTimes(1); // No additional calls
      expect(secondNews).toHaveLength(1);
      expect(secondNews).toEqual(firstNews);
    });

    it('should throw error when feed fetch fails', async () => {
      mockParseURL.mockRejectedValueOnce(new Error('Network error'));

      await expect(newsService.getNews()).rejects.toThrow('Failed to fetch news');
    });

    it('should handle items with missing fields gracefully', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: undefined,
            link: undefined,
            isoDate: '2025-12-10T10:00:00Z',
          },
          {
            title: 'Valid News',
            link: 'https://en.wikinews.org/wiki/Valid',
            isoDate: undefined,
          },
        ],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const news = await newsService.getNews();

      expect(news).toHaveLength(2);
      expect(news[0]).toMatchObject({
        title: '',
        link: '',
        published: '2025-12-10T10:00:00Z',
      });
      // Second item should use fallback for missing isoDate
      expect(news[1].title).toBe('Valid News');
      expect(news[1].link).toBe('https://en.wikinews.org/wiki/Valid');
      expect(news[1].published).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // Should be current date
    });

    it('should prefer pubDate over isoDate when both present', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'RSS News Item',
            link: 'https://en.wikinews.org/wiki/RSS',
            pubDate: '2025-12-10T12:00:00Z',
            isoDate: '2025-12-10T10:00:00Z',
          },
        ],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const news = await newsService.getNews();

      expect(news[0].published).toBe('2025-12-10T12:00:00Z');
    });
  });

  describe('getNewsFormatted', () => {
    it('should return formatted news string with default limit', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'News 1',
            link: 'https://en.wikinews.org/wiki/News_1',
            isoDate: '2025-12-10T10:00:00Z',
          },
          {
            title: 'News 2',
            link: 'https://en.wikinews.org/wiki/News_2',
            isoDate: '2025-12-10T09:00:00Z',
          },
        ],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const formatted = await newsService.getNewsFormatted();

      expect(formatted).toContain('News 1');
      expect(formatted).toContain('News 2');
      expect(formatted).toContain('Here are the latest headlines:');
    });

    it('should limit news items based on parameter', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'News 1',
            link: 'https://en.wikinews.org/wiki/News_1',
            isoDate: '2025-12-10T10:00:00Z',
          },
          {
            title: 'News 2',
            link: 'https://en.wikinews.org/wiki/News_2',
            isoDate: '2025-12-10T09:00:00Z',
          },
          {
            title: 'News 3',
            link: 'https://en.wikinews.org/wiki/News_3',
            isoDate: '2025-12-10T08:00:00Z',
          },
        ],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const formatted = await newsService.getNewsFormatted(2);

      expect(formatted).toContain('News 1');
      expect(formatted).toContain('News 2');
      expect(formatted).not.toContain('News 3');
    });

    it('should return fallback message when news fetch fails', async () => {
      mockParseURL.mockRejectedValueOnce(new Error('Network error'));

      const formatted = await newsService.getNewsFormatted();

      expect(formatted).toBe('Sorry, I could not fetch the news at this time.');
    });

    it('should return no news message when feed is empty', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const formatted = await newsService.getNewsFormatted();

      expect(formatted).toBe('No news available at this time.');
    });
  });

  describe('getNewsJSON', () => {
    it('should return news items as JSON array', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'JSON News',
            link: 'https://en.wikinews.org/wiki/JSON_News',
            isoDate: '2025-12-10T10:00:00Z',
          },
        ],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const newsJSON = await newsService.getNewsJSON();

      expect(Array.isArray(newsJSON)).toBe(true);
      expect(newsJSON).toHaveLength(1);
      expect(newsJSON[0]).toEqual({
        title: 'JSON News',
        link: 'https://en.wikinews.org/wiki/JSON_News',
        published: '2025-12-10T10:00:00Z',
      });
    });

    it('should return empty array when fetch fails', async () => {
      mockParseURL.mockRejectedValueOnce(new Error('Network error'));

      const newsJSON = await newsService.getNewsJSON();

      expect(newsJSON).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear cached news', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'Cached News',
            link: 'https://en.wikinews.org/wiki/Cached',
            isoDate: '2025-12-10T10:00:00Z',
          },
        ],
      };

      mockParseURL.mockResolvedValue(mockFeedOutput as any);

      // First call
      await newsService.getNews();
      expect(mockParseURL).toHaveBeenCalledTimes(1);

      // Clear cache
      newsService.clearCache();

      // Should fetch again after cache clear
      await newsService.getNews();
      expect(mockParseURL).toHaveBeenCalledTimes(2);
    });
  });

  describe('check', () => {
    it('should return true when news service is working', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [
          {
            title: 'Test News',
            link: 'https://en.wikinews.org/wiki/Test',
            isoDate: '2025-12-10T10:00:00Z',
          },
        ],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const result = await newsService.check();
      expect(result).toBe(true);
    });

    it('should return false when news service fails', async () => {
      mockParseURL.mockRejectedValueOnce(new Error('Network error'));

      const result = await newsService.check();
      expect(result).toBe(false);
    });

    it('should return false when feed is empty', async () => {
      const mockFeedOutput = {
        title: 'English Wikinews Atom feed.',
        items: [],
      };

      mockParseURL.mockResolvedValueOnce(mockFeedOutput as any);

      const result = await newsService.check();
      expect(result).toBe(false);
    });
  });
});
