import WolframAlphaAPI from '@wolfram-alpha/wolfram-alpha-api';
import { WolframResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { Cache } from '../utils/cache.js';
import { config } from '../config/index.js';

/**
 * Wolfram Alpha Service
 * Provides computational knowledge and factual queries via Wolfram Alpha API
 */
export class WolframService {
  private client: any;
  private cache: Cache<WolframResult>;

  constructor(appId?: string) {
    const wolframAppId = appId || config.wolframAlphaAppId;
    this.client = WolframAlphaAPI(wolframAppId);
    this.cache = new Cache<WolframResult>();
  }

  /**
   * Query Wolfram Alpha for computational/factual information
   * Uses Simple Answer API for straightforward text responses
   */
  async query(input: string): Promise<WolframResult> {
    // Check cache first
    const cacheKey = input.toLowerCase().trim();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached Wolfram result');
      return cached;
    }

    try {
      logger.debug(`Querying Wolfram Alpha: ${input}`);

      // Use getShort for Simple Answer API
      const answer = await this.client.getShort(input);

      if (!answer || answer.trim() === '') {
        throw new Error('No results from Wolfram Alpha');
      }

      // Create result object from simple answer
      const result: WolframResult = {
        query: input,
        shortAnswer: answer,
        detailedAnswer: answer,
        pods: [
          {
            title: 'Result',
            content: answer,
          },
        ],
        success: true,
      };

      // Cache for 1 hour (computational results are generally stable)
      this.cache.set(cacheKey, result, 3600000);

      logger.debug(`Wolfram query successful: ${result.shortAnswer}`);
      return result;
    } catch (error) {
      logger.error('Error querying Wolfram Alpha:', error);
      // Re-throw specific errors
      if (error instanceof Error && error.message === 'No results from Wolfram Alpha') {
        throw error;
      }
      throw new Error('Failed to query Wolfram Alpha');
    }
  }


  /**
   * Get formatted answer suitable for conversational response
   */
  async getFormattedAnswer(query: string): Promise<string> {
    try {
      const result = await this.query(query);

      if (!result.success || !result.shortAnswer) {
        return "I couldn't find a definitive answer to that question.";
      }

      return result.shortAnswer;
    } catch (error) {
      logger.error('Error getting formatted Wolfram answer:', error);
      // Distinguish between "no results" and actual errors
      if (error instanceof Error && error.message === 'No results from Wolfram Alpha') {
        return "I couldn't find a definitive answer to that question.";
      }
      return 'Sorry, I encountered an error processing that query.';
    }
  }

  /**
   * Check if a query is suitable for Wolfram Alpha
   * (computational, mathematical, factual queries)
   */
  isSuitableQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Mathematical operations
    const mathPatterns = [
      /\d+\s*[\+\-\*\/\^]\s*\d+/, // Basic math: 5 + 3, 10 * 2
      /\b(sin|cos|tan|log|ln|sqrt|integral|derivative|solve)\b/,
      /what is \d+/,
      /calculate/,
      /how many/,
    ];

    // Scientific/factual queries
    const factualPatterns = [
      /\b(atomic|chemical|element|molecule|compound)\b/,
      /\b(distance|mass|weight|volume|area|temperature) of\b/,
      /\b(population|capital|country|city|state)\b/,
      /\b(convert|conversion)\b/,
      /\b(formula|equation)\b/,
      /when (was|is|did)/,
      /who (was|is|invented|discovered)/,
      /where is/,
    ];

    // Check if message matches any pattern
    const allPatterns = [...mathPatterns, ...factualPatterns];
    return allPatterns.some((pattern) => pattern.test(lowerMessage));
  }

  /**
   * Clear Wolfram cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Wolfram cache cleared');
  }

  /**
   * Check if Wolfram service is working
   */
  async check(): Promise<boolean> {
    try {
      // Simple test query
      const result = await this.query('2 + 2');
      return result.success && result.shortAnswer === '4';
    } catch (error) {
      logger.error('Wolfram service check failed:', error);
      return false;
    }
  }
}
