/**
 * PiperTTSEngine - TTS engine using Piper subprocess
 *
 * Responsibilities:
 * - Run Piper TTS as a subprocess
 * - Convert text to WAV audio
 * - Handle timeout and errors
 * - Auto-detect piper and model paths
 */

import type { TTSEngine, PiperEngineOptions } from '../types';
import { existsSync } from 'fs';
import { platform } from 'os';

// Default paths by platform
const DEFAULT_PATHS = {
  darwin: {
    piper: 'piper', // Use PATH
    model: '/usr/local/share/piper/voices/en_US-lessac-medium.onnx',
  },
  linux: {
    piper: '/usr/local/bin/piper',
    model: '/usr/local/share/piper/voices/en_US-lessac-medium.onnx',
  },
  win32: {
    piper: 'C:\\Program Files\\Piper\\piper\\piper.exe',
    model: 'C:\\Program Files\\Piper\\voices\\en_US-lessac-medium.onnx',
  },
};

export class PiperTTSEngine implements TTSEngine {
  private readonly piperPath: string;
  private readonly modelPath: string;
  private readonly timeout: number;

  constructor(options?: PiperEngineOptions) {
    const plat = platform() as keyof typeof DEFAULT_PATHS;
    const defaults = DEFAULT_PATHS[plat] ?? DEFAULT_PATHS.linux;

    this.piperPath = options?.piperPath ?? defaults.piper;
    this.modelPath = options?.modelPath ?? defaults.model;
    this.timeout = options?.timeout ?? 30000;
  }

  /**
   * Check if Piper is available (executable and model exist).
   */
  async isAvailable(): Promise<boolean> {
    // Check if piper executable is accessible
    const piperAvailable = await this.checkPiperExecutable();
    if (!piperAvailable) {
      return false;
    }

    // Check if model file exists
    if (!existsSync(this.modelPath)) {
      return false;
    }

    return true;
  }

  /**
   * Synthesize text to WAV audio.
   */
  async synthesize(text: string): Promise<Uint8Array> {
    // Validate and sanitize text
    const sanitized = this.sanitizeText(text);
    if (!sanitized) {
      throw new Error('Text cannot be empty');
    }

    // Check availability first
    const available = await this.isAvailable();
    if (!available) {
      if (!existsSync(this.modelPath)) {
        throw new Error(`Piper model not found: ${this.modelPath}`);
      }
      throw new Error(`Piper executable not available: ${this.piperPath}`);
    }

    // Run piper subprocess
    return this.runPiper(sanitized);
  }

  /**
   * Sanitize text for TTS.
   * Removes control characters, normalizes whitespace.
   */
  sanitizeText(text: string): string {
    return text
      // Remove control characters (except newline, tab)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize multiple spaces/newlines to single space
      .replace(/\s+/g, ' ')
      // Trim
      .trim();
  }

  /**
   * Get the configured Piper executable path.
   */
  getPiperPath(): string {
    return this.piperPath;
  }

  /**
   * Get the configured model path.
   */
  getModelPath(): string {
    return this.modelPath;
  }

  /**
   * Get the configured timeout.
   */
  getTimeout(): number {
    return this.timeout;
  }

  /**
   * Check if the piper executable is available.
   */
  private async checkPiperExecutable(): Promise<boolean> {
    try {
      // Try running piper --version to check if it's available
      const proc = Bun.spawn([this.piperPath, '--version'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Wait for process to exit with timeout
      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => {
          proc.kill();
          reject(new Error('Timeout checking piper'));
        }, 5000);
      });

      try {
        const exitCode = await Promise.race([proc.exited, timeoutPromise]);
        return exitCode === 0;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Run Piper subprocess to synthesize audio.
   */
  private async runPiper(text: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const args = [
        this.piperPath,
        '--model',
        this.modelPath,
        '--output-raw',
      ];

      const proc = Bun.spawn(args, {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        proc.kill();
        reject(new Error(`Piper synthesis timed out after ${this.timeout}ms`));
      }, this.timeout);

      // Write text to stdin and close
      proc.stdin.write(text + '\n');
      proc.stdin.end();

      // Collect stdout (audio data)
      const chunks: Uint8Array[] = [];

      // Process output asynchronously
      (async () => {
        try {
          // Read stdout
          const reader = proc.stdout.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }

          // Wait for process to exit
          const exitCode = await proc.exited;
          clearTimeout(timeoutId);

          if (exitCode !== 0) {
            // Read stderr for error message
            const stderrReader = proc.stderr.getReader();
            const stderrChunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await stderrReader.read();
              if (done) break;
              stderrChunks.push(value);
            }
            const stderr = new TextDecoder().decode(
              new Uint8Array(stderrChunks.flatMap((c) => [...c]))
            );
            reject(new Error(`Piper failed with exit code ${exitCode}: ${stderr}`));
            return;
          }

          // Combine chunks into single Uint8Array
          const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
          const audio = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            audio.set(chunk, offset);
            offset += chunk.length;
          }

          // Piper with --output-raw returns raw PCM audio
          // We need to wrap it in a WAV header
          const wav = this.wrapWithWavHeader(audio);
          resolve(wav);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      })();
    });
  }

  /**
   * Wrap raw PCM audio data with a WAV header.
   * Piper outputs 16-bit mono PCM at 22050 Hz.
   */
  private wrapWithWavHeader(pcmData: Uint8Array): Uint8Array {
    const sampleRate = 22050;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;

    const headerSize = 44;
    const dataSize = pcmData.length;
    const fileSize = headerSize + dataSize - 8;

    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize, true);
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Copy PCM data
    uint8.set(pcmData, headerSize);

    return uint8;
  }

  /**
   * Write ASCII string to DataView.
   */
  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
