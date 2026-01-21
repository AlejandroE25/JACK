import WebSocket from 'ws';

/**
 * Helper class for testing WebSocket connections
 */
export class WebSocketTestClient {
  private ws: WebSocket | null = null;
  private received: string[] = [];
  private connected: boolean = false;

  constructor(private url: string) {}

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.received.push(data.toString());
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Send a message to the server
   */
  async send(message: string): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      this.ws!.send(message, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Wait for a message from the server
   */
  async waitForMessage(timeout = 5000): Promise<string> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (this.received.length > 0) {
        return this.received.shift()!;
      }
      await new Promise((r) => setTimeout(r, 10));
    }

    throw new Error('Message timeout');
  }

  /**
   * Get all received messages
   */
  getReceivedMessages(): string[] {
    return [...this.received];
  }

  /**
   * Clear received messages
   */
  clearReceivedMessages(): void {
    this.received = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }

  /**
   * Wait for connection to close
   */
  async waitForClose(timeout = 5000): Promise<void> {
    if (!this.ws) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Close timeout'));
      }, timeout);

      this.ws!.on('close', () => {
        clearTimeout(timer);
        this.connected = false;
        resolve();
      });
    });
  }
}

/**
 * Create a test WebSocket client
 */
export function createTestClient(url: string): WebSocketTestClient {
  return new WebSocketTestClient(url);
}
