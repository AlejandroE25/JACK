import Parser from 'rss-parser';
import { NewsItem } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { Cache } from '../utils/cache.js';
import { config } from '../config/index.js';

const WIKINEWS_RSS_URL =
  'https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&notcategories=No%20publish%7CArchived%7CAutoArchived%7Cdisputed&namespace=0&count=30&hourcount=124&ordermethod=categoryadd&stablepages=only';

/**
 * News Service
 * Fetches latest news from Wikinews RSS feed
 */
export class NewsService {
  private cache: Cache<NewsItem[]>;
  private parser: Parser;

  constructor() {
    this.cache = new Cache<NewsItem[]>();
    this.parser = new Parser();
  }

  /**
   * Get news from Wikinews RSS feed
   */
  async getNews(): Promise<NewsItem[]> {
    // Check cache first
    const cached = this.cache.get('news');
    if (cached) {
      logger.debug('Using cached news');
      return cached;
    }

    try {
      const feed = await this.parser.parseURL(WIKINEWS_RSS_URL);

      const news = this.parseRSSFeed(feed);

      // Cache for 1 hour
      this.cache.set('news', news, config.newsCacheTTL);

      logger.debug(`Fetched ${news.length} news items`);
      return news;
    } catch (error) {
      logger.error('Error fetching news:', error);
      throw new Error('Failed to fetch news');
    }
  }

  /**
   * Parse RSS feed items from rss-parser response
   */
  private parseRSSFeed(feed: Parser.Output<any>): NewsItem[] {
    return feed.items.map((item) => ({
      title: item.title || '',
      link: item.link || '',
      published: item.pubDate || item.isoDate || new Date().toISOString(),
    }));
  }

  /**
   * Get formatted news string
   */
  async getNewsFormatted(limit = 5): Promise<string> {
    try {
      const news = await this.getNews();
      const headlines = news.slice(0, limit).map((item) => item.title);

      if (headlines.length === 0) {
        return 'No news available at this time.';
      }

      return `Here are the latest headlines: ${headlines.join('. ')}.`;
    } catch (error) {
      logger.error('Error getting formatted news:', error);
      return 'Sorry, I could not fetch the news at this time.';
    }
  }

  /**
   * Get news as JSON array (for GUIs)
   */
  async getNewsJSON(): Promise<NewsItem[]> {
    try {
      return await this.getNews();
    } catch (error) {
      logger.error('Error getting news JSON:', error);
      return [];
    }
  }

  /**
   * Clear news cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('News cache cleared');
  }

  /**
   * Check if news service is working
   */
  async check(): Promise<boolean> {
    try {
      const news = await this.getNews();
      return news.length > 0;
    } catch (error) {
      logger.error('News service check failed:', error);
      return false;
    }
  }
}
