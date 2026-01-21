import { describe, it, expect } from 'vitest';
import { MessageProcessor } from '../../../src/server/messageProcessor.js';

describe('MessageProcessor', () => {
  describe('parse', () => {
    it('should parse valid PACE message', () => {
      const message = 'Hello PACE$$Hello! I am PACE.';
      const result = MessageProcessor.parse(message);

      expect(result).not.toBeNull();
      expect(result?.query).toBe('Hello PACE');
      expect(result?.response).toBe('Hello! I am PACE.');
    });

    it('should trim whitespace from query and response', () => {
      const message = '  Hello PACE  $$  Hello! I am PACE.  ';
      const result = MessageProcessor.parse(message);

      expect(result?.query).toBe('Hello PACE');
      expect(result?.response).toBe('Hello! I am PACE.');
    });

    it('should return null for invalid format', () => {
      const message = 'Invalid message without delimiter';
      const result = MessageProcessor.parse(message);

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = MessageProcessor.parse('');
      expect(result).toBeNull();
    });

    it('should return null for message with multiple delimiters', () => {
      const message = 'query$$response$$extra';
      const result = MessageProcessor.parse(message);

      expect(result).toBeNull();
    });
  });

  describe('format', () => {
    it('should format query and response correctly', () => {
      const query = 'Hello PACE';
      const response = 'Hello! I am PACE.';
      const result = MessageProcessor.format(query, response);

      expect(result).toBe('Hello PACE$$Hello! I am PACE.');
    });

    it('should throw error for empty query', () => {
      expect(() => {
        MessageProcessor.format('', 'response');
      }).toThrow();
    });

    it('should throw error for empty response', () => {
      expect(() => {
        MessageProcessor.format('query', '');
      }).toThrow();
    });
  });

  describe('validate', () => {
    it('should validate correct message format', () => {
      const message = 'query$$response';
      expect(MessageProcessor.validate(message)).toBe(true);
    });

    it('should reject invalid message format', () => {
      const message = 'invalid message';
      expect(MessageProcessor.validate(message)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(MessageProcessor.validate('')).toBe(false);
    });

    it('should reject message with multiple delimiters', () => {
      const message = 'query$$response$$extra';
      expect(MessageProcessor.validate(message)).toBe(false);
    });
  });

  describe('extractQuery', () => {
    it('should extract query from valid message', () => {
      const message = 'Hello PACE$$Hello!';
      const result = MessageProcessor.extractQuery(message);

      expect(result).toBe('Hello PACE');
    });

    it('should return null for invalid message', () => {
      const message = 'invalid';
      const result = MessageProcessor.extractQuery(message);

      expect(result).toBeNull();
    });
  });

  describe('extractResponse', () => {
    it('should extract response from valid message', () => {
      const message = 'Hello PACE$$Hello!';
      const result = MessageProcessor.extractResponse(message);

      expect(result).toBe('Hello!');
    });

    it('should return null for invalid message', () => {
      const message = 'invalid';
      const result = MessageProcessor.extractResponse(message);

      expect(result).toBeNull();
    });
  });
});
