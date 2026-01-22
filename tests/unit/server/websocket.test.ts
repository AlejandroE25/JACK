import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { JackServer, type ServerConfig } from '../../../src/server/websocket';
import { Codec } from '../../../src/protocol/codec';
import type { Message, ConnectPayload, ConnectedPayload, InputPayload } from '../../../src/types';

const codec = new Codec();

// Helper to create a test message
function createMessage<T>(type: string, payload: T): Message<T> {
  return {
    id: crypto.randomUUID(),
    type: type as Message['type'],
    ts: Date.now(),
    payload,
  };
}

// Helper to connect a WebSocket client
async function connectClient(
  port: number,
  clientType: 'cli' | 'web' | 'mobile' = 'cli',
  existingClientId?: string
): Promise<{ ws: WebSocket; clientId: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      const connectMsg = createMessage<ConnectPayload>('connect', {
        clientId: existingClientId,
        clientType,
        version: '2.0.0',
      });
      ws.send(codec.encode(connectMsg));
    };

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      const msg = codec.decode(data) as Message<ConnectedPayload>;
      if (msg.type === 'connected') {
        resolve({ ws, clientId: msg.payload.clientId });
      }
    };

    ws.onerror = reject;

    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

describe('JackServer', () => {
  let server: JackServer;
  let port: number;

  beforeEach(async () => {
    port = 3000 + Math.floor(Math.random() * 1000);
    server = new JackServer({ port });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('connection', () => {
    test('accepts WebSocket connections', async () => {
      const { ws, clientId } = await connectClient(port);
      expect(clientId).toBeTruthy();
      expect(clientId.length).toBeGreaterThan(0);
      ws.close();
    });

    test('assigns unique client IDs to new connections', async () => {
      const client1 = await connectClient(port);
      const client2 = await connectClient(port);

      expect(client1.clientId).not.toBe(client2.clientId);

      client1.ws.close();
      client2.ws.close();
    });

    test('restores existing client ID on reconnect', async () => {
      const client1 = await connectClient(port);
      const originalId = client1.clientId;
      client1.ws.close();

      // Wait for disconnect to process
      await new Promise((r) => setTimeout(r, 100));

      const client2 = await connectClient(port, 'cli', originalId);
      expect(client2.clientId).toBe(originalId);
      client2.ws.close();
    });

    test('sends isReconnect: true for returning clients', async () => {
      const client1 = await connectClient(port);
      const originalId = client1.clientId;
      client1.ws.close();

      await new Promise((r) => setTimeout(r, 100));

      // Connect and check the full connected message
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.binaryType = 'arraybuffer';

      const connectedMsg = await new Promise<Message<ConnectedPayload>>((resolve) => {
        ws.onopen = () => {
          const connectMsg = createMessage<ConnectPayload>('connect', {
            clientId: originalId,
            clientType: 'cli',
            version: '2.0.0',
          });
          ws.send(codec.encode(connectMsg));
        };

        ws.onmessage = (event) => {
          const data = new Uint8Array(event.data as ArrayBuffer);
          resolve(codec.decode(data) as Message<ConnectedPayload>);
        };
      });

      expect(connectedMsg.payload.isReconnect).toBe(true);
      ws.close();
    });

    test('sends isReconnect: false for new clients', async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.binaryType = 'arraybuffer';

      const connectedMsg = await new Promise<Message<ConnectedPayload>>((resolve) => {
        ws.onopen = () => {
          const connectMsg = createMessage<ConnectPayload>('connect', {
            clientType: 'web',
            version: '2.0.0',
          });
          ws.send(codec.encode(connectMsg));
        };

        ws.onmessage = (event) => {
          const data = new Uint8Array(event.data as ArrayBuffer);
          resolve(codec.decode(data) as Message<ConnectedPayload>);
        };
      });

      expect(connectedMsg.payload.isReconnect).toBe(false);
      ws.close();
    });
  });

  describe('message handling', () => {
    test('receives and processes input messages', async () => {
      const inputHandler = mock((clientId: string, text: string) => {});
      server.onInput(inputHandler);

      const { ws, clientId } = await connectClient(port);

      const inputMsg = createMessage<InputPayload>('input', { text: 'Hello JACK' });
      ws.send(codec.encode(inputMsg));

      // Wait for message to be processed
      await new Promise((r) => setTimeout(r, 100));

      expect(inputHandler).toHaveBeenCalledWith(clientId, 'Hello JACK');
      ws.close();
    });

    test('handles interrupt messages', async () => {
      const interruptHandler = mock((clientId: string) => {});
      server.onInterrupt(interruptHandler);

      const { ws, clientId } = await connectClient(port);

      const interruptMsg = createMessage('interrupt', {});
      ws.send(codec.encode(interruptMsg));

      await new Promise((r) => setTimeout(r, 100));

      expect(interruptHandler).toHaveBeenCalledWith(clientId);
      ws.close();
    });
  });

  describe('sending messages', () => {
    test('sends speech message to client', async () => {
      const { ws, clientId } = await connectClient(port);

      const receivedMessages: Message[] = [];
      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        receivedMessages.push(codec.decode(data));
      };

      const audioData = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF
      server.sendSpeech(clientId, 'Hello', audioData);

      await new Promise((r) => setTimeout(r, 100));

      const speechMsg = receivedMessages.find((m) => m.type === 'speech');
      expect(speechMsg).toBeTruthy();
      expect((speechMsg?.payload as { text: string }).text).toBe('Hello');
      ws.close();
    });

    test('sends ack message to client', async () => {
      const { ws, clientId } = await connectClient(port);

      const receivedMessages: Message[] = [];
      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        receivedMessages.push(codec.decode(data));
      };

      const audioData = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      server.sendAck(clientId, 'On it.', audioData);

      await new Promise((r) => setTimeout(r, 100));

      const ackMsg = receivedMessages.find((m) => m.type === 'ack');
      expect(ackMsg).toBeTruthy();
      expect((ackMsg?.payload as { text: string }).text).toBe('On it.');
      ws.close();
    });

    test('sends error message to client', async () => {
      const { ws, clientId } = await connectClient(port);

      const receivedMessages: Message[] = [];
      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        receivedMessages.push(codec.decode(data));
      };

      server.sendError(clientId, 'NOT_FOUND', 'Resource not found');

      await new Promise((r) => setTimeout(r, 100));

      const errorMsg = receivedMessages.find((m) => m.type === 'error');
      expect(errorMsg).toBeTruthy();
      expect((errorMsg?.payload as { code: string }).code).toBe('NOT_FOUND');
      ws.close();
    });

    test('does not throw when sending to disconnected client', async () => {
      const { ws, clientId } = await connectClient(port);
      ws.close();

      await new Promise((r) => setTimeout(r, 100));

      // Should not throw
      expect(() => {
        server.sendSpeech(clientId, 'Hello', new Uint8Array([0]));
      }).not.toThrow();
    });
  });

  describe('client tracking', () => {
    test('tracks connected clients', async () => {
      expect(server.getClientCount()).toBe(0);

      const client1 = await connectClient(port);
      expect(server.getClientCount()).toBe(1);

      const client2 = await connectClient(port);
      expect(server.getClientCount()).toBe(2);

      client1.ws.close();
      await new Promise((r) => setTimeout(r, 100));
      expect(server.getClientCount()).toBe(1);

      client2.ws.close();
      await new Promise((r) => setTimeout(r, 100));
      expect(server.getClientCount()).toBe(0);
    });

    test('provides list of connected client IDs', async () => {
      const client1 = await connectClient(port);
      const client2 = await connectClient(port);

      const clientIds = server.getClientIds();
      expect(clientIds).toContain(client1.clientId);
      expect(clientIds).toContain(client2.clientId);

      client1.ws.close();
      client2.ws.close();
    });
  });
});
