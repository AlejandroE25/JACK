import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Orchestrator } from '../../../src/ui/orchestrator';
import type {
  UserInput,
  ParsedIntent,
  IntentParseResult,
  ExecutionResult,
  ModalityDecision,
  TaskStatus,
} from '../../../src/types';
import type { IntentParser, ClaudeClient } from '../../../src/ui/intentParser';
import type { ModalityEngine } from '../../../src/ui/modalityEngine';

// Mock dependencies
function createMockParser(result: Partial<IntentParseResult>): IntentParser {
  return {
    parseInput: mock(async () => ({
      intents: result.intents || [],
      executionOrder: result.executionOrder || [],
      requiresAcknowledgment: result.requiresAcknowledgment ?? false,
      clarificationNeeded: result.clarificationNeeded,
    })),
  } as unknown as IntentParser;
}

function createMockModalityEngine(): ModalityEngine {
  return {
    decide: mock(() => ({
      voice: true,
      document: false,
      autoOpen: false,
    })),
  } as unknown as ModalityEngine;
}

// Mock action executor
function createMockExecutor(results: ExecutionResult[]): { execute: ReturnType<typeof mock> } {
  let callIndex = 0;
  return {
    execute: mock(async () => {
      return results[callIndex++] || { intentId: 'unknown', action: 'unknown', success: false };
    }),
  };
}

describe('Orchestrator', () => {
  describe('handle', () => {
    test('processes simple input and returns result', async () => {
      const intent: ParsedIntent = {
        id: 'i1',
        action: 'get_time',
        parameters: {},
        dependencies: [],
      };

      const parser = createMockParser({
        intents: [intent],
        executionOrder: [['i1']],
        requiresAcknowledgment: false,
      });

      const modalityEngine = createMockModalityEngine();
      const executor = createMockExecutor([
        { intentId: 'i1', action: 'get_time', success: true, data: { time: '3:45' } },
      ]);

      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      const callbacks = {
        onAck: mock(() => {}),
        onSpeech: mock(() => {}),
        onDocument: mock(() => {}),
        onClarify: mock(() => {}),
        onError: mock(() => {}),
      };

      const input: UserInput = {
        clientId: 'client-1',
        text: 'What time is it?',
        timestamp: Date.now(),
      };

      await orchestrator.handle(input, callbacks);

      // Should call speech (result), not ack (fast action)
      expect(callbacks.onAck).not.toHaveBeenCalled();
      expect(callbacks.onSpeech).toHaveBeenCalled();
    });

    test('sends acknowledgment for slow actions', async () => {
      const intent: ParsedIntent = {
        id: 'i1',
        action: 'research',
        parameters: { topic: 'databases' },
        dependencies: [],
      };

      const parser = createMockParser({
        intents: [intent],
        executionOrder: [['i1']],
        requiresAcknowledgment: true,
      });

      const modalityEngine = createMockModalityEngine();
      const executor = createMockExecutor([
        { intentId: 'i1', action: 'research', success: true, data: {} },
      ]);

      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      const callbacks = {
        onAck: mock(() => {}),
        onSpeech: mock(() => {}),
        onDocument: mock(() => {}),
        onClarify: mock(() => {}),
        onError: mock(() => {}),
      };

      await orchestrator.handle({
        clientId: 'client-1',
        text: 'Research databases',
        timestamp: Date.now(),
      }, callbacks);

      expect(callbacks.onAck).toHaveBeenCalled();
    });

    test('sends clarification when needed', async () => {
      const parser = createMockParser({
        intents: [],
        executionOrder: [],
        requiresAcknowledgment: false,
        clarificationNeeded: {
          question: 'Which report?',
          options: ['sales.pdf', 'annual.pdf'],
        },
      });

      const modalityEngine = createMockModalityEngine();
      const executor = createMockExecutor([]);
      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      const callbacks = {
        onAck: mock(() => {}),
        onSpeech: mock(() => {}),
        onDocument: mock(() => {}),
        onClarify: mock(() => {}),
        onError: mock(() => {}),
      };

      await orchestrator.handle({
        clientId: 'client-1',
        text: 'Open the report',
        timestamp: Date.now(),
      }, callbacks);

      expect(callbacks.onClarify).toHaveBeenCalledWith(
        'Which report?',
        ['sales.pdf', 'annual.pdf']
      );
      expect(callbacks.onSpeech).not.toHaveBeenCalled();
    });

    test('sends document notification when modality requires it', async () => {
      const intent: ParsedIntent = {
        id: 'i1',
        action: 'research',
        parameters: {},
        dependencies: [],
      };

      const parser = createMockParser({
        intents: [intent],
        executionOrder: [['i1']],
        requiresAcknowledgment: true,
      });

      const modalityEngine = {
        decide: mock(() => ({
          voice: true,
          document: true,
          documentType: 'markdown' as const,
          documentLocation: '/Users/test/Desktop',
          autoOpen: true,
          highlights: 'Summary here',
        })),
      } as unknown as ModalityEngine;

      const executor = createMockExecutor([
        { intentId: 'i1', action: 'research', success: true, data: {} },
      ]);

      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      const callbacks = {
        onAck: mock(() => {}),
        onSpeech: mock(() => {}),
        onDocument: mock((path: string, type: string) => {}),
        onClarify: mock(() => {}),
        onError: mock(() => {}),
      };

      await orchestrator.handle({
        clientId: 'client-1',
        text: 'Research databases',
        timestamp: Date.now(),
      }, callbacks);

      expect(callbacks.onDocument).toHaveBeenCalled();
    });

    test('handles execution errors gracefully', async () => {
      const intent: ParsedIntent = {
        id: 'i1',
        action: 'unknown_action',
        parameters: {},
        dependencies: [],
      };

      const parser = createMockParser({
        intents: [intent],
        executionOrder: [['i1']],
        requiresAcknowledgment: false,
      });

      const modalityEngine = createMockModalityEngine();
      const executor = createMockExecutor([
        { intentId: 'i1', action: 'unknown_action', success: false, error: 'Action not found' },
      ]);

      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      const callbacks = {
        onAck: mock(() => {}),
        onSpeech: mock(() => {}),
        onDocument: mock(() => {}),
        onClarify: mock(() => {}),
        onError: mock((code: string, message: string) => {}),
      };

      await orchestrator.handle({
        clientId: 'client-1',
        text: 'Do unknown thing',
        timestamp: Date.now(),
      }, callbacks);

      expect(callbacks.onError).toHaveBeenCalled();
    });
  });

  describe('interrupt', () => {
    test('interrupts running task', async () => {
      const intent: ParsedIntent = {
        id: 'i1',
        action: 'research',
        parameters: {},
        dependencies: [],
      };

      const parser = createMockParser({
        intents: [intent],
        executionOrder: [['i1']],
        requiresAcknowledgment: true,
      });

      const modalityEngine = createMockModalityEngine();

      // Slow executor that can be interrupted
      let interrupted = false;
      const executor = {
        execute: mock(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (interrupted) {
            return { intentId: 'i1', action: 'research', success: false, error: 'Interrupted' };
          }
          return { intentId: 'i1', action: 'research', success: true, data: {} };
        }),
      };

      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      const callbacks = {
        onAck: mock(() => {}),
        onSpeech: mock(() => {}),
        onDocument: mock(() => {}),
        onClarify: mock(() => {}),
        onError: mock(() => {}),
      };

      // Start the task
      const handlePromise = orchestrator.handle({
        clientId: 'client-1',
        text: 'Research databases',
        timestamp: Date.now(),
      }, callbacks);

      // Give it time to start
      await new Promise((r) => setTimeout(r, 50));

      // Interrupt
      interrupted = true;
      orchestrator.interrupt('client-1');

      await handlePromise;

      // Task should be marked as interrupted
      const status = orchestrator.getTaskStatus('client-1');
      expect(status?.state).toBe('interrupted');
    });
  });

  describe('getTaskStatus', () => {
    test('returns null for unknown client', () => {
      const parser = createMockParser({ intents: [], executionOrder: [] });
      const modalityEngine = createMockModalityEngine();
      const executor = createMockExecutor([]);
      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      const status = orchestrator.getTaskStatus('unknown-client');
      expect(status).toBeNull();
    });

    test('returns task status for active task', async () => {
      const intent: ParsedIntent = {
        id: 'i1',
        action: 'get_time',
        parameters: {},
        dependencies: [],
      };

      const parser = createMockParser({
        intents: [intent],
        executionOrder: [['i1']],
        requiresAcknowledgment: false,
      });

      const modalityEngine = createMockModalityEngine();
      const executor = createMockExecutor([
        { intentId: 'i1', action: 'get_time', success: true, data: { time: '3:45' } },
      ]);

      const orchestrator = new Orchestrator(parser, modalityEngine, executor);

      await orchestrator.handle({
        clientId: 'client-1',
        text: 'What time is it?',
        timestamp: Date.now(),
      }, {
        onAck: () => {},
        onSpeech: () => {},
        onDocument: () => {},
        onClarify: () => {},
        onError: () => {},
      });

      const status = orchestrator.getTaskStatus('client-1');
      expect(status).toBeTruthy();
      expect(status?.state).toBe('completed');
      expect(status?.results).toHaveLength(1);
    });
  });
});
