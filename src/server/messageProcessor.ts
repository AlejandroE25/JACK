import { PACEMessage } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Message Processor
 * Parses and formats messages according to PACE protocol
 */
export class MessageProcessor {
  /**
   * Parse a PACE message in format: "query$$response"
   */
  static parse(message: string): PACEMessage | null {
    if (!message || typeof message !== 'string') {
      logger.warn('Invalid message format: empty or not a string');
      return null;
    }

    const parts = message.split('$$');
    if (parts.length !== 2) {
      logger.warn(`Invalid message format: expected "query$$response", got "${message}"`);
      return null;
    }

    return {
      query: parts[0].trim(),
      response: parts[1].trim(),
    };
  }

  /**
   * Format a query and response into PACE message format
   */
  static format(query: string, response: string): string {
    if (!query || !response) {
      throw new Error('Query and response are required');
    }

    return `${query}$$${response}`;
  }

  /**
   * Validate message format
   */
  static validate(message: string): boolean {
    if (!message || typeof message !== 'string') {
      return false;
    }

    return message.includes('$$') && message.split('$$').length === 2;
  }

  /**
   * Extract query from message
   */
  static extractQuery(message: string): string | null {
    const parsed = this.parse(message);
    return parsed ? parsed.query : null;
  }

  /**
   * Extract response from message
   */
  static extractResponse(message: string): string | null {
    const parsed = this.parse(message);
    return parsed ? parsed.response : null;
  }
}
