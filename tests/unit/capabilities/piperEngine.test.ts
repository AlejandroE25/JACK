/**
 * PiperTTSEngine Tests
 *
 * Tests for the Piper TTS engine that runs Piper in a subprocess.
 * Following TDD - tests written before implementation.
 *
 * Note: Most tests use mocked subprocess for portability.
 * Integration tests with real Piper are skipped if Piper is not installed.
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll } from 'bun:test';
import { PiperTTSEngine } from '../../../src/capabilities/piperEngine';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'jack-piper-test');

// Check if Piper is available - resolved before tests run
let piperInstalled = false;

beforeAll(async () => {
  try {
    const proc = Bun.spawn(['piper', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    piperInstalled = exitCode === 0;
  } catch {
    piperInstalled = false;
  }
});

describe('PiperTTSEngine', () => {
  let engine: PiperTTSEngine;

  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    test('creates engine with default options', () => {
      engine = new PiperTTSEngine();
      expect(engine).toBeDefined();
    });

    test('creates engine with custom piper path', () => {
      engine = new PiperTTSEngine({
        piperPath: '/custom/path/to/piper',
      });
      expect(engine).toBeDefined();
    });

    test('creates engine with custom model path', () => {
      engine = new PiperTTSEngine({
        modelPath: '/custom/path/to/model.onnx',
      });
      expect(engine).toBeDefined();
    });

    test('creates engine with custom timeout', () => {
      engine = new PiperTTSEngine({
        timeout: 5000,
      });
      expect(engine).toBeDefined();
    });
  });

  describe('isAvailable()', () => {
    test('returns false when piper executable not found', async () => {
      engine = new PiperTTSEngine({
        piperPath: '/nonexistent/path/to/piper',
      });

      const available = await engine.isAvailable();
      expect(available).toBe(false);
    });

    test('returns false when model file not found', async () => {
      engine = new PiperTTSEngine({
        modelPath: '/nonexistent/model.onnx',
      });

      const available = await engine.isAvailable();
      expect(available).toBe(false);
    });

    // Integration test - only runs if Piper is installed
    test('returns true when piper and model available', async () => {
      if (!piperInstalled) {
        console.log('Skipping: Piper not installed');
        return;
      }

      engine = new PiperTTSEngine();

      const available = await engine.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('synthesize()', () => {
    test('throws error when piper not available', async () => {
      engine = new PiperTTSEngine({
        piperPath: '/nonexistent/path/to/piper',
      });

      await expect(engine.synthesize('Hello')).rejects.toThrow();
    });

    test('throws error on empty text', async () => {
      engine = new PiperTTSEngine();

      await expect(engine.synthesize('')).rejects.toThrow('Text cannot be empty');
    });

    test('throws error on whitespace-only text', async () => {
      engine = new PiperTTSEngine();

      await expect(engine.synthesize('   \n\t  ')).rejects.toThrow('Text cannot be empty');
    });

    // Integration test - only runs if Piper is installed
    test('synthesizes text to WAV audio', async () => {
      if (!piperInstalled) {
        console.log('Skipping: Piper not installed');
        return;
      }

      engine = new PiperTTSEngine();

      const audio = await engine.synthesize('Hello, world!');

      // Should return Uint8Array
      expect(audio).toBeInstanceOf(Uint8Array);

      // Should have content (WAV files are at least a few KB)
      expect(audio.length).toBeGreaterThan(1000);

      // Should be valid WAV (starts with RIFF header)
      const header = new TextDecoder().decode(audio.slice(0, 4));
      expect(header).toBe('RIFF');
    });

    // Integration test - only runs if Piper is installed
    test('handles multi-line text', async () => {
      if (!piperInstalled) {
        console.log('Skipping: Piper not installed');
        return;
      }

      engine = new PiperTTSEngine();

      const audio = await engine.synthesize('Line one.\nLine two.\nLine three.');

      expect(audio).toBeInstanceOf(Uint8Array);
      expect(audio.length).toBeGreaterThan(1000);
    });

    // Integration test - only runs if Piper is installed
    test('handles special characters', async () => {
      if (!piperInstalled) {
        console.log('Skipping: Piper not installed');
        return;
      }

      engine = new PiperTTSEngine();

      const audio = await engine.synthesize("Hello! How's it going? It's great.");

      expect(audio).toBeInstanceOf(Uint8Array);
      expect(audio.length).toBeGreaterThan(1000);
    });
  });

  describe('timeout handling', () => {
    test('uses default timeout of 30 seconds', () => {
      engine = new PiperTTSEngine();
      expect(engine.getTimeout()).toBe(30000);
    });

    test('uses custom timeout when specified', () => {
      engine = new PiperTTSEngine({ timeout: 5000 });
      expect(engine.getTimeout()).toBe(5000);
    });
  });

  describe('concurrent synthesis', () => {
    // Integration test - only runs if Piper is installed
    test('handles multiple concurrent requests', async () => {
      if (!piperInstalled) {
        console.log('Skipping: Piper not installed');
        return;
      }

      engine = new PiperTTSEngine();

      const results = await Promise.all([
        engine.synthesize('First sentence.'),
        engine.synthesize('Second sentence.'),
        engine.synthesize('Third sentence.'),
      ]);

      expect(results).toHaveLength(3);
      for (const audio of results) {
        expect(audio).toBeInstanceOf(Uint8Array);
        expect(audio.length).toBeGreaterThan(1000);
      }
    });
  });

  describe('text sanitization', () => {
    test('sanitizes control characters', () => {
      engine = new PiperTTSEngine();

      const sanitized = engine.sanitizeText('Hello\x00World\x07Test');
      expect(sanitized).toBe('HelloWorldTest');
    });

    test('preserves normal punctuation', () => {
      engine = new PiperTTSEngine();

      const sanitized = engine.sanitizeText("Hello, world! How's it going?");
      expect(sanitized).toBe("Hello, world! How's it going?");
    });

    test('trims whitespace', () => {
      engine = new PiperTTSEngine();

      const sanitized = engine.sanitizeText('   Hello world   ');
      expect(sanitized).toBe('Hello world');
    });

    test('normalizes multiple spaces', () => {
      engine = new PiperTTSEngine();

      const sanitized = engine.sanitizeText('Hello    world');
      expect(sanitized).toBe('Hello world');
    });
  });

  describe('error messages', () => {
    test('provides helpful error when piper not found', async () => {
      engine = new PiperTTSEngine({
        piperPath: '/nonexistent/piper',
      });

      try {
        await engine.synthesize('Hello');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain('Piper');
      }
    });

    test('provides helpful error when model not found', async () => {
      engine = new PiperTTSEngine({
        modelPath: '/nonexistent/model.onnx',
      });

      try {
        await engine.synthesize('Hello');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message.toLowerCase()).toMatch(/model|piper/);
      }
    });
  });
});

describe('PiperTTSEngine path detection', () => {
  test('detects default piper path on macOS', () => {
    const engine = new PiperTTSEngine();
    const defaultPath = engine.getPiperPath();

    // Should return a valid path string
    expect(typeof defaultPath).toBe('string');
    expect(defaultPath.length).toBeGreaterThan(0);
  });

  test('detects default model path', () => {
    const engine = new PiperTTSEngine();
    const modelPath = engine.getModelPath();

    expect(typeof modelPath).toBe('string');
    expect(modelPath).toContain('.onnx');
  });
});
