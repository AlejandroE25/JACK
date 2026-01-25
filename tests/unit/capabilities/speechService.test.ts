/**
 * Speech Service Tests
 *
 * Tests for the Speech Service that handles TTS via Piper in a subprocess.
 * Following TDD - tests written before implementation.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SpeechService } from '../../../src/capabilities/speechService';
import type { SpeechMessage, TTSEngine } from '../../../src/types';

// Mock TTS engine for testing (doesn't require Piper installed)
function createMockTTSEngine(options?: {
  synthesizeDelay?: number;
  shouldFail?: boolean;
  failureMessage?: string;
}): TTSEngine {
  const { synthesizeDelay = 10, shouldFail = false, failureMessage = 'TTS failed' } = options ?? {};

  return {
    synthesize: async (text: string): Promise<Uint8Array> => {
      if (shouldFail) {
        throw new Error(failureMessage);
      }
      // Simulate TTS processing time
      await new Promise((resolve) => setTimeout(resolve, synthesizeDelay));
      // Return fake WAV data (just the text encoded as bytes for testing)
      return new TextEncoder().encode(`AUDIO:${text}`);
    },
    isAvailable: async (): Promise<boolean> => !shouldFail,
  };
}

describe('SpeechService', () => {
  let service: SpeechService;
  let mockEngine: TTSEngine;
  let receivedMessages: Array<{ clientId: string; message: SpeechMessage }>;

  beforeEach(() => {
    receivedMessages = [];
    mockEngine = createMockTTSEngine();
    service = new SpeechService({
      ttsEngine: mockEngine,
      onSpeechReady: (clientId, message) => {
        receivedMessages.push({ clientId, message });
      },
    });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('speak()', () => {
    test('fires and forgets - returns immediately', async () => {
      const start = Date.now();
      service.speak('client1', 'Hello world');
      const elapsed = Date.now() - start;

      // Should return almost immediately (not wait for TTS)
      expect(elapsed).toBeLessThan(5);
    });

    test('calls onSpeechReady callback when TTS completes', async () => {
      service.speak('client1', 'Hello world');

      // Wait for async TTS to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].clientId).toBe('client1');
      expect(receivedMessages[0].message.text).toBe('Hello world');
      expect(receivedMessages[0].message.audio).toBeInstanceOf(Uint8Array);
    });

    test('handles multiple speak requests for same client', async () => {
      service.speak('client1', 'First');
      service.speak('client1', 'Second');
      service.speak('client1', 'Third');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages.map((m) => m.message.text)).toEqual(['First', 'Second', 'Third']);
    });

    test('handles speak requests for different clients', async () => {
      service.speak('client1', 'Hello');
      service.speak('client2', 'World');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages.find((m) => m.clientId === 'client1')?.message.text).toBe('Hello');
      expect(receivedMessages.find((m) => m.clientId === 'client2')?.message.text).toBe('World');
    });

    test('includes audio data in speech message', async () => {
      service.speak('client1', 'Test audio');

      await new Promise((resolve) => setTimeout(resolve, 50));

      const message = receivedMessages[0].message;
      expect(message.audio.length).toBeGreaterThan(0);
      // Verify our mock audio contains the text
      const audioText = new TextDecoder().decode(message.audio);
      expect(audioText).toBe('AUDIO:Test audio');
    });
  });

  describe('isSpeaking()', () => {
    test('returns false for client with no active speech', () => {
      expect(service.isSpeaking('client1')).toBe(false);
    });

    test('returns true while speech is being generated', async () => {
      // Use slower mock engine
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 100 }),
        onSpeechReady: (clientId, message) => {
          receivedMessages.push({ clientId, message });
        },
      });

      service.speak('client1', 'Long speech');

      // Should be speaking while TTS is processing
      expect(service.isSpeaking('client1')).toBe(true);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should no longer be speaking
      expect(service.isSpeaking('client1')).toBe(false);
    });

    test('returns false for unknown client', () => {
      expect(service.isSpeaking('unknown')).toBe(false);
    });

    test('tracks speaking state per client independently', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 100 }),
        onSpeechReady: () => {},
      });

      service.speak('client1', 'Speaking');

      expect(service.isSpeaking('client1')).toBe(true);
      expect(service.isSpeaking('client2')).toBe(false);
    });
  });

  describe('interrupt()', () => {
    test('stops pending speech for client', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 100 }),
        onSpeechReady: (clientId, message) => {
          receivedMessages.push({ clientId, message });
        },
      });

      service.speak('client1', 'This should be interrupted');
      service.interrupt('client1');

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Speech should have been interrupted - no message received
      expect(receivedMessages).toHaveLength(0);
      expect(service.isSpeaking('client1')).toBe(false);
    });

    test('does nothing for client with no active speech', () => {
      // Should not throw
      service.interrupt('unknown');
      expect(service.isSpeaking('unknown')).toBe(false);
    });

    test('only interrupts specified client', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 50 }),
        onSpeechReady: (clientId, message) => {
          receivedMessages.push({ clientId, message });
        },
      });

      service.speak('client1', 'Should be interrupted');
      service.speak('client2', 'Should complete');

      service.interrupt('client1');

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Only client2's speech should have completed
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].clientId).toBe('client2');
    });

    test('interrupts all pending speech for client', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 50 }),
        onSpeechReady: (clientId, message) => {
          receivedMessages.push({ clientId, message });
        },
      });

      service.speak('client1', 'First');
      service.speak('client1', 'Second');
      service.speak('client1', 'Third');

      service.interrupt('client1');

      await new Promise((resolve) => setTimeout(resolve, 150));

      // All three should have been interrupted
      expect(receivedMessages).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    test('calls onError callback when TTS fails', async () => {
      const errors: Array<{ clientId: string; text: string; error: string }> = [];

      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ shouldFail: true, failureMessage: 'Piper crashed' }),
        onSpeechReady: () => {},
        onError: (clientId, text, error) => {
          errors.push({ clientId, text, error });
        },
      });

      service.speak('client1', 'This will fail');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errors).toHaveLength(1);
      expect(errors[0].clientId).toBe('client1');
      expect(errors[0].text).toBe('This will fail');
      expect(errors[0].error).toBe('Piper crashed');
    });

    test('continues processing other requests after error', async () => {
      let callCount = 0;
      const failingEngine: TTSEngine = {
        synthesize: async (text: string) => {
          callCount++;
          if (callCount === 1) {
            throw new Error('First call fails');
          }
          return new TextEncoder().encode(`AUDIO:${text}`);
        },
        isAvailable: async () => true,
      };

      service = new SpeechService({
        ttsEngine: failingEngine,
        onSpeechReady: (clientId, message) => {
          receivedMessages.push({ clientId, message });
        },
        onError: () => {},
      });

      service.speak('client1', 'First - will fail');
      service.speak('client1', 'Second - will succeed');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].message.text).toBe('Second - will succeed');
    });

    test('marks speaking as false after error', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ shouldFail: true }),
        onSpeechReady: () => {},
        onError: () => {},
      });

      service.speak('client1', 'Will fail');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(service.isSpeaking('client1')).toBe(false);
    });
  });

  describe('queue management', () => {
    test('processes speak requests in order', async () => {
      const order: string[] = [];

      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 10 }),
        onSpeechReady: (_clientId, message) => {
          order.push(message.text);
        },
      });

      service.speak('client1', 'First');
      service.speak('client1', 'Second');
      service.speak('client1', 'Third');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(order).toEqual(['First', 'Second', 'Third']);
    });

    test('returns queue size for client', () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 1000 }),
        onSpeechReady: () => {},
      });

      service.speak('client1', 'First');
      service.speak('client1', 'Second');
      service.speak('client1', 'Third');

      expect(service.getQueueSize('client1')).toBe(3);
      expect(service.getQueueSize('client2')).toBe(0);
    });

    test('clears queue on interrupt', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 1000 }),
        onSpeechReady: () => {},
      });

      service.speak('client1', 'First');
      service.speak('client1', 'Second');
      service.speak('client1', 'Third');

      expect(service.getQueueSize('client1')).toBe(3);

      service.interrupt('client1');

      expect(service.getQueueSize('client1')).toBe(0);
    });
  });

  describe('shutdown()', () => {
    test('stops all active speech generation', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ synthesizeDelay: 100 }),
        onSpeechReady: (clientId, message) => {
          receivedMessages.push({ clientId, message });
        },
      });

      service.speak('client1', 'Should be interrupted');
      service.speak('client2', 'Also interrupted');

      await service.shutdown();

      // Wait to make sure nothing completes
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(receivedMessages).toHaveLength(0);
    });

    test('prevents new speak requests after shutdown', async () => {
      await service.shutdown();

      service.speak('client1', 'Should be ignored');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedMessages).toHaveLength(0);
    });

    test('can be called multiple times safely', async () => {
      await service.shutdown();
      await service.shutdown();
      await service.shutdown();
      // Should not throw
    });
  });

  describe('TTS engine availability', () => {
    test('checks engine availability', async () => {
      const available = await service.isEngineAvailable();
      expect(available).toBe(true);
    });

    test('returns false when engine not available', async () => {
      service = new SpeechService({
        ttsEngine: createMockTTSEngine({ shouldFail: true }),
        onSpeechReady: () => {},
      });

      const available = await service.isEngineAvailable();
      expect(available).toBe(false);
    });
  });
});

describe('SpeechService configuration', () => {
  test('uses default options when not provided', () => {
    const mockEngine = createMockTTSEngine();
    const service = new SpeechService({
      ttsEngine: mockEngine,
      onSpeechReady: () => {},
    });

    // Should not throw
    expect(service).toBeDefined();
    service.shutdown();
  });

  test('accepts custom max queue size', async () => {
    const mockEngine = createMockTTSEngine({ synthesizeDelay: 1000 });
    const dropped: string[] = [];

    const service = new SpeechService({
      ttsEngine: mockEngine,
      onSpeechReady: () => {},
      maxQueueSize: 2,
      onQueueFull: (_clientId, text) => {
        dropped.push(text);
      },
    });

    service.speak('client1', 'First');
    service.speak('client1', 'Second');
    service.speak('client1', 'Third - should be dropped');

    expect(service.getQueueSize('client1')).toBe(2);
    expect(dropped).toEqual(['Third - should be dropped']);

    await service.shutdown();
  });
});
