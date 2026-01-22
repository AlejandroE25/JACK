import { describe, test, expect } from 'bun:test';
import { Codec } from '../../../src/protocol/codec';
import type { Message, MessageType } from '../../../src/types';

describe('Codec', () => {
  const codec = new Codec();

  describe('encode', () => {
    test('encodes a simple message to Uint8Array', () => {
      const message: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'input',
        ts: 1705123456789,
        payload: { text: 'Hello' },
      };

      const encoded = codec.encode(message);

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });

    test('encodes binary payloads (audio)', () => {
      const audioData = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF header
      const message: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'speech',
        ts: 1705123456789,
        payload: { text: 'Hello', audio: audioData },
      };

      const encoded = codec.encode(message);

      expect(encoded).toBeInstanceOf(Uint8Array);
    });

    test('produces smaller output than JSON for typical messages', () => {
      const message: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'input',
        ts: 1705123456789,
        payload: { text: 'What is the weather like today?' },
      };

      const encoded = codec.encode(message);
      const jsonSize = JSON.stringify(message).length;

      expect(encoded.length).toBeLessThan(jsonSize);
    });
  });

  describe('decode', () => {
    test('decodes a message back to original structure', () => {
      const original: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'input',
        ts: 1705123456789,
        payload: { text: 'Hello' },
      };

      const encoded = codec.encode(original);
      const decoded = codec.decode(encoded);

      expect(decoded).toEqual(original);
    });

    test('preserves binary data through encode/decode cycle', () => {
      const audioData = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x01, 0x02, 0x03]);
      const original: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'speech',
        ts: 1705123456789,
        payload: { text: 'Hello', audio: audioData },
      };

      const encoded = codec.encode(original);
      const decoded = codec.decode(encoded) as Message<{ text: string; audio: Uint8Array }>;

      expect(decoded.payload.text).toBe('Hello');
      expect(decoded.payload.audio).toEqual(audioData);
    });

    test('throws on invalid MessagePack data', () => {
      const invalidData = new Uint8Array([0xFF, 0xFF, 0xFF]);

      expect(() => codec.decode(invalidData)).toThrow();
    });

    test('handles all message types', () => {
      const types: MessageType[] = [
        'connect', 'input', 'interrupt', 'task_status', 'context_update',
        'connected', 'ack', 'speech', 'document', 'progress', 'error', 'clarify',
      ];

      for (const type of types) {
        const message: Message = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          type,
          ts: 1705123456789,
          payload: {},
        };

        const encoded = codec.encode(message);
        const decoded = codec.decode(encoded);

        expect(decoded.type).toBe(type);
      }
    });
  });

  describe('roundtrip', () => {
    test('handles nested objects', () => {
      const message: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'context_update',
        ts: 1705123456789,
        payload: {
          type: 'location',
          data: {
            lat: 37.7749,
            lon: -122.4194,
            city: 'San Francisco',
            nested: { deep: { value: 42 } },
          },
        },
      };

      const decoded = codec.decode(codec.encode(message));
      expect(decoded).toEqual(message);
    });

    test('handles arrays', () => {
      const message: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'clarify',
        ts: 1705123456789,
        payload: {
          question: 'Which file?',
          options: ['file1.txt', 'file2.txt', 'file3.txt'],
        },
      };

      const decoded = codec.decode(codec.encode(message));
      expect(decoded).toEqual(message);
    });

    test('handles null in payload', () => {
      const message: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'progress',
        ts: 1705123456789,
        payload: {
          taskId: 'task-1',
          status: 'progress',
          message: null,
        },
      };

      const encoded = codec.encode(message);
      const decoded = codec.decode(encoded) as Message<{ taskId: string; status: string; message: null }>;

      expect(decoded.payload.taskId).toBe('task-1');
      expect(decoded.payload.message).toBeNull();
    });

    test('handles empty payload', () => {
      const message: Message = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'interrupt',
        ts: 1705123456789,
        payload: {},
      };

      const decoded = codec.decode(codec.encode(message));
      expect(decoded).toEqual(message);
    });
  });
});
