/**
 * JackServer - WebSocket server for JACK
 *
 * Protocol:
 * - All messages are MessagePack encoded
 * - Clients send 'connect' with optional existing clientId
 * - Server responds with 'connected' containing assigned/confirmed clientId
 * - Client IDs are persistent across reconnections
 *
 * Message flow:
 * 1. Client connects → sends 'connect' → receives 'connected'
 * 2. Client sends 'input' with text
 * 3. Server may send 'ack', 'speech', 'document', 'progress', 'error', 'clarify'
 * 4. Client can send 'interrupt' to stop current task
 */

import type { Server, ServerWebSocket } from 'bun';
import { Codec } from '../protocol/codec';
import type {
  Message,
  MessageType,
  ConnectPayload,
  ConnectedPayload,
  InputPayload,
  AckPayload,
  SpeechPayload,
  ErrorPayload,
  DocumentPayload,
  ProgressPayload,
  ClarifyPayload,
} from '../types';

export interface ServerConfig {
  port: number;
  hostname?: string;
}

interface ClientInfo {
  id: string;
  type: 'cli' | 'web' | 'mobile';
  version: string;
  ws: ServerWebSocket<ClientData>;
}

interface ClientData {
  clientId?: string;
}

type InputHandler = (clientId: string, text: string) => void;
type InterruptHandler = (clientId: string) => void;

export class JackServer {
  private server: Server | null = null;
  private codec = new Codec();
  private clients = new Map<string, ClientInfo>();
  private knownClientIds = new Set<string>(); // Track IDs even after disconnect

  private inputHandlers: InputHandler[] = [];
  private interruptHandlers: InterruptHandler[] = [];

  constructor(private config: ServerConfig) {}

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    const self = this;

    this.server = Bun.serve<ClientData>({
      port: this.config.port,
      hostname: this.config.hostname || 'localhost',

      fetch(req, server) {
        // Upgrade HTTP request to WebSocket
        const upgraded = server.upgrade(req, {
          data: { clientId: undefined },
        });

        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 400 });
        }

        return undefined;
      },

      websocket: {
        open(ws) {
          // Wait for 'connect' message before assigning clientId
        },

        message(ws, message) {
          self.handleMessage(ws, message);
        },

        close(ws) {
          const clientId = ws.data.clientId;
          if (clientId) {
            self.clients.delete(clientId);
            // Keep clientId in knownClientIds for reconnection
          }
        },
      },
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
      this.clients.clear();
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: ServerWebSocket<ClientData>, rawMessage: string | Buffer): void {
    try {
      const data = rawMessage instanceof Buffer
        ? new Uint8Array(rawMessage)
        : new Uint8Array(Buffer.from(rawMessage));

      const message = this.codec.decode(data);

      switch (message.type) {
        case 'connect':
          this.handleConnect(ws, message as Message<ConnectPayload>);
          break;

        case 'input':
          this.handleInput(ws, message as Message<InputPayload>);
          break;

        case 'interrupt':
          this.handleInterrupt(ws);
          break;

        default:
          // Unknown message type - ignore or log
          break;
      }
    } catch {
      // Invalid message - ignore
    }
  }

  /**
   * Handle 'connect' message - assign or restore client ID
   */
  private handleConnect(ws: ServerWebSocket<ClientData>, message: Message<ConnectPayload>): void {
    const { clientId: requestedId, clientType, version } = message.payload;

    let clientId: string;
    let isReconnect = false;

    if (requestedId && this.knownClientIds.has(requestedId)) {
      // Restore existing client ID
      clientId = requestedId;
      isReconnect = true;
    } else {
      // Assign new client ID
      clientId = crypto.randomUUID();
      this.knownClientIds.add(clientId);
    }

    // Store client info
    ws.data.clientId = clientId;
    this.clients.set(clientId, {
      id: clientId,
      type: clientType,
      version,
      ws,
    });

    // Send 'connected' response
    const response = this.createMessage<ConnectedPayload>('connected', {
      clientId,
      isReconnect,
    });

    ws.send(this.codec.encode(response));
  }

  /**
   * Handle 'input' message
   */
  private handleInput(ws: ServerWebSocket<ClientData>, message: Message<InputPayload>): void {
    const clientId = ws.data.clientId;
    if (!clientId) return;

    const { text } = message.payload;
    this.inputHandlers.forEach((handler) => handler(clientId, text));
  }

  /**
   * Handle 'interrupt' message
   */
  private handleInterrupt(ws: ServerWebSocket<ClientData>): void {
    const clientId = ws.data.clientId;
    if (!clientId) return;

    this.interruptHandlers.forEach((handler) => handler(clientId));
  }

  /**
   * Register handler for input messages
   */
  onInput(handler: InputHandler): void {
    this.inputHandlers.push(handler);
  }

  /**
   * Register handler for interrupt messages
   */
  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandlers.push(handler);
  }

  /**
   * Send speech message to a client
   */
  sendSpeech(clientId: string, text: string, audio: Uint8Array): void {
    this.sendToClient(clientId, 'speech', { text, audio } as SpeechPayload);
  }

  /**
   * Send acknowledgment message to a client
   */
  sendAck(clientId: string, text: string, audio: Uint8Array): void {
    this.sendToClient(clientId, 'ack', { text, audio } as AckPayload);
  }

  /**
   * Send error message to a client
   */
  sendError(clientId: string, code: string, message: string): void {
    this.sendToClient(clientId, 'error', { code, message } as ErrorPayload);
  }

  /**
   * Send document notification to a client
   */
  sendDocument(clientId: string, path: string, type: 'markdown' | 'code' | 'data'): void {
    this.sendToClient(clientId, 'document', { path, type } as DocumentPayload);
  }

  /**
   * Send progress update to a client
   */
  sendProgress(
    clientId: string,
    taskId: string,
    status: ProgressPayload['status'],
    message?: string
  ): void {
    this.sendToClient(clientId, 'progress', { taskId, status, message } as ProgressPayload);
  }

  /**
   * Send clarification request to a client
   */
  sendClarify(clientId: string, question: string, options?: string[]): void {
    this.sendToClient(clientId, 'clarify', { question, options } as ClarifyPayload);
  }

  /**
   * Send a message to a specific client
   */
  private sendToClient<T>(clientId: string, type: MessageType, payload: T): void {
    const client = this.clients.get(clientId);
    if (!client) return; // Client disconnected - silently ignore

    const message = this.createMessage(type, payload);
    try {
      client.ws.send(this.codec.encode(message));
    } catch {
      // Send failed - client may have disconnected
    }
  }

  /**
   * Create a message with standard envelope
   */
  private createMessage<T>(type: MessageType, payload: T): Message<T> {
    return {
      id: crypto.randomUUID(),
      type,
      ts: Date.now(),
      payload,
    };
  }

  /**
   * Get count of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get list of connected client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }
}
