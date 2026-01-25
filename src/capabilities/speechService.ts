/**
 * SpeechService - Non-blocking TTS via separate processing
 *
 * Responsibilities:
 * - Fire-and-forget speech synthesis
 * - Per-client queuing with interrupt support
 * - Callback-based delivery when audio is ready
 * - Graceful error handling
 */

import type { SpeechMessage, SpeechServiceOptions, TTSEngine } from '../types';

interface QueueItem {
  text: string;
  aborted: boolean;
}

interface ClientState {
  queue: QueueItem[];
  processing: boolean;
}

export class SpeechService {
  private readonly ttsEngine: TTSEngine;
  private readonly onSpeechReady: (clientId: string, message: SpeechMessage) => void;
  private readonly onError?: (clientId: string, text: string, error: string) => void;
  private readonly onQueueFull?: (clientId: string, text: string) => void;
  private readonly maxQueueSize: number;

  private readonly clients = new Map<string, ClientState>();
  private isShutdown = false;

  constructor(options: SpeechServiceOptions) {
    this.ttsEngine = options.ttsEngine;
    this.onSpeechReady = options.onSpeechReady;
    this.onError = options.onError;
    this.onQueueFull = options.onQueueFull;
    this.maxQueueSize = options.maxQueueSize ?? 10;
  }

  /**
   * Fire-and-forget speech synthesis.
   * Returns immediately, calls onSpeechReady when audio is ready.
   */
  speak(clientId: string, text: string): void {
    if (this.isShutdown) {
      return;
    }

    let clientState = this.clients.get(clientId);
    if (!clientState) {
      clientState = { queue: [], processing: false };
      this.clients.set(clientId, clientState);
    }

    // Check queue size limit
    if (clientState.queue.length >= this.maxQueueSize) {
      this.onQueueFull?.(clientId, text);
      return;
    }

    // Add to queue
    const item: QueueItem = { text, aborted: false };
    clientState.queue.push(item);

    // Start processing if not already
    if (!clientState.processing) {
      this.processQueue(clientId);
    }
  }

  /**
   * Interrupt all pending and active speech for a client.
   */
  interrupt(clientId: string): void {
    const clientState = this.clients.get(clientId);
    if (!clientState) {
      return;
    }

    // Mark all items as aborted and clear queue
    for (const item of clientState.queue) {
      item.aborted = true;
    }
    clientState.queue = [];
  }

  /**
   * Check if a client has active or pending speech.
   */
  isSpeaking(clientId: string): boolean {
    const clientState = this.clients.get(clientId);
    if (!clientState) {
      return false;
    }
    return clientState.queue.length > 0 || clientState.processing;
  }

  /**
   * Get the number of pending speech requests for a client.
   */
  getQueueSize(clientId: string): number {
    const clientState = this.clients.get(clientId);
    return clientState?.queue.length ?? 0;
  }

  /**
   * Check if the TTS engine is available.
   */
  async isEngineAvailable(): Promise<boolean> {
    return this.ttsEngine.isAvailable();
  }

  /**
   * Shutdown the service, stopping all processing.
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;

    // Interrupt all clients
    for (const clientId of this.clients.keys()) {
      this.interrupt(clientId);
    }

    // Clear all client state
    this.clients.clear();
  }

  /**
   * Process the queue for a client.
   * Runs asynchronously, processing items in order.
   */
  private async processQueue(clientId: string): Promise<void> {
    const clientState = this.clients.get(clientId);
    if (!clientState || clientState.processing) {
      return;
    }

    clientState.processing = true;

    while (clientState.queue.length > 0 && !this.isShutdown) {
      const item = clientState.queue[0];

      // Check if aborted before processing
      if (item.aborted) {
        clientState.queue.shift();
        continue;
      }

      try {
        // Synthesize speech
        const audio = await this.ttsEngine.synthesize(item.text);

        // Check if aborted after synthesis (interrupt called during processing)
        if (item.aborted || this.isShutdown) {
          clientState.queue.shift();
          continue;
        }

        // Deliver the speech
        const message: SpeechMessage = {
          text: item.text,
          audio,
        };

        this.onSpeechReady(clientId, message);
      } catch (error) {
        // Report error
        const errorMessage = error instanceof Error ? error.message : 'Unknown TTS error';
        this.onError?.(clientId, item.text, errorMessage);
      }

      // Remove processed item
      clientState.queue.shift();
    }

    clientState.processing = false;
  }
}
