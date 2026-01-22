import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { IntentParser, type ClaudeClient } from '../../../src/ui/intentParser';
import type { ParsedIntent, IntentParseResult } from '../../../src/types';

// Mock Claude client for testing
function createMockClaude(response: Partial<IntentParseResult>): ClaudeClient {
  return {
    parseIntent: mock(async () => ({
      intents: response.intents || [],
      executionOrder: response.executionOrder || [],
      requiresAcknowledgment: false, // Will be computed by parser
      ...response,
    })),
  };
}

describe('IntentParser', () => {
  describe('parseInput', () => {
    test('parses simple single intent', async () => {
      const mockIntent: ParsedIntent = {
        id: 'intent-1',
        action: 'get_weather',
        parameters: { location: 'San Francisco' },
        dependencies: [],
      };

      const claude = createMockClaude({
        intents: [mockIntent],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('What is the weather in San Francisco?');

      expect(result.intents).toHaveLength(1);
      expect(result.intents[0].action).toBe('get_weather');
      expect(result.intents[0].parameters.location).toBe('San Francisco');
    });

    test('parses compound intent with multiple actions', async () => {
      const intents: ParsedIntent[] = [
        {
          id: 'intent-1',
          action: 'get_weather',
          parameters: { location: 'here' },
          dependencies: [],
        },
        {
          id: 'intent-2',
          action: 'create_reminder',
          parameters: { text: 'bring umbrella' },
          dependencies: ['intent-1'],
          conditional: true,
          conditionExpr: 'weather.isRainy',
        },
      ];

      const claude = createMockClaude({
        intents,
        executionOrder: [['intent-1'], ['intent-2']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('Get weather and remind me about umbrella if rainy');

      expect(result.intents).toHaveLength(2);
      expect(result.intents[1].dependencies).toContain('intent-1');
      expect(result.intents[1].conditional).toBe(true);
    });

    test('identifies parallel execution opportunities', async () => {
      const intents: ParsedIntent[] = [
        {
          id: 'intent-1',
          action: 'get_weather',
          parameters: {},
          dependencies: [],
        },
        {
          id: 'intent-2',
          action: 'get_time',
          parameters: {},
          dependencies: [],
        },
      ];

      const claude = createMockClaude({
        intents,
        executionOrder: [['intent-1', 'intent-2']], // Both in same group = parallel
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('What is the weather and time?');

      expect(result.executionOrder).toHaveLength(1);
      expect(result.executionOrder[0]).toContain('intent-1');
      expect(result.executionOrder[0]).toContain('intent-2');
    });

    test('returns clarification when intent is ambiguous', async () => {
      const claude = createMockClaude({
        intents: [],
        executionOrder: [],
        clarificationNeeded: {
          question: 'Which file do you mean?',
          options: ['report.pdf', 'report-v2.pdf'],
        },
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('Open the report');

      expect(result.clarificationNeeded).toBeTruthy();
      expect(result.clarificationNeeded?.question).toBe('Which file do you mean?');
      expect(result.clarificationNeeded?.options).toContain('report.pdf');
    });
  });

  describe('shouldAcknowledge (hardcoded logic)', () => {
    test('returns false for single fast action', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'get_time',
          parameters: {},
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('What time is it?');

      expect(result.requiresAcknowledgment).toBe(false);
    });

    test('returns false for get_weather (fast action)', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'get_weather',
          parameters: {},
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('What is the weather?');

      expect(result.requiresAcknowledgment).toBe(false);
    });

    test('returns false for get_date (fast action)', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'get_date',
          parameters: {},
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('What is the date?');

      expect(result.requiresAcknowledgment).toBe(false);
    });

    test('returns false for simple_math (fast action)', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'simple_math',
          parameters: { expression: '2 + 2' },
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('What is 2 + 2?');

      expect(result.requiresAcknowledgment).toBe(false);
    });

    test('returns true for multiple intents', async () => {
      const claude = createMockClaude({
        intents: [
          { id: 'i1', action: 'get_time', parameters: {}, dependencies: [] },
          { id: 'i2', action: 'get_weather', parameters: {}, dependencies: [] },
        ],
        executionOrder: [['i1', 'i2']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('What is the time and weather?');

      expect(result.requiresAcknowledgment).toBe(true);
    });

    test('returns true for slow action (research)', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'research',
          parameters: { topic: 'databases' },
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('Research database options');

      expect(result.requiresAcknowledgment).toBe(true);
    });

    test('returns true for slow action (create_reminder)', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'create_reminder',
          parameters: { text: 'buy milk' },
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('Remind me to buy milk');

      expect(result.requiresAcknowledgment).toBe(true);
    });

    test('returns true for unknown action', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'unknown_custom_action',
          parameters: {},
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('Do something custom');

      expect(result.requiresAcknowledgment).toBe(true);
    });
  });

  describe('context handling', () => {
    test('passes recent intents to Claude for follow-up resolution', async () => {
      const claude = createMockClaude({
        intents: [{
          id: 'intent-1',
          action: 'get_weather',
          parameters: { location: 'San Francisco' }, // Resolved from context
          dependencies: [],
        }],
        executionOrder: [['intent-1']],
      });

      const parser = new IntentParser(claude);

      // Simulate context with previous location mention
      const context = {
        recentIntents: [
          {
            intent: { id: 'prev-1', action: 'get_weather', parameters: { location: 'San Francisco' }, dependencies: [] },
            result: { temp: 72 },
            timestamp: Date.now() - 30000,
          },
        ],
      };

      const result = await parser.parseInput('What about tomorrow?', context);

      // Claude should have been called with context
      expect(claude.parseIntent).toHaveBeenCalled();
      const callArgs = (claude.parseIntent as ReturnType<typeof mock>).mock.calls[0];
      expect(callArgs[1]).toBe(context);
    });
  });

  describe('error handling', () => {
    test('throws on Claude API error', async () => {
      const claude: ClaudeClient = {
        parseIntent: mock(async () => {
          throw new Error('API rate limit');
        }),
      };

      const parser = new IntentParser(claude);

      await expect(parser.parseInput('Hello')).rejects.toThrow('API rate limit');
    });

    test('handles empty input gracefully', async () => {
      const claude = createMockClaude({
        intents: [],
        executionOrder: [],
        clarificationNeeded: {
          question: 'What would you like me to do?',
        },
      });

      const parser = new IntentParser(claude);
      const result = await parser.parseInput('');

      expect(result.intents).toHaveLength(0);
      expect(result.clarificationNeeded).toBeTruthy();
    });
  });
});
