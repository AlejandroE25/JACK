import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PACEWebSocketServer } from '../../../src/server/websocket.js';
import { createTestClient } from '../../helpers/websocketHelper.js';

describe('WebSocket Server', () => {
  let server: PACEWebSocketServer;
  const TEST_PORT = 9002;

  beforeEach(async () => {
    server = new PACEWebSocketServer({ port: TEST_PORT, host: 'localhost' });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should start server on specified port', () => {
    expect(server.isRunning()).toBe(true);
  });

  it('should accept client connections', async () => {
    const client = createTestClient(`ws://localhost:${TEST_PORT}`);
    await client.connect();

    expect(client.isConnected()).toBe(true);
    client.close();
  });

  it('should send welcome message to new clients', async () => {
    const client = createTestClient(`ws://localhost:${TEST_PORT}`);
    await client.connect();

    const message = await client.waitForMessage();
    expect(message).toContain(' $$ ');
    expect(message).toBeTruthy();

    client.close();
  });

  it('should broadcast messages to all clients', async () => {
    const client1 = createTestClient(`ws://localhost:${TEST_PORT}`);
    const client2 = createTestClient(`ws://localhost:${TEST_PORT}`);

    await client1.connect();
    await client2.connect();

    // Clear welcome messages
    await client1.waitForMessage();
    await client2.waitForMessage();

    const testMessage = 'Hello PACE';
    await client1.send(testMessage);

    const response1 = await client1.waitForMessage();
    const response2 = await client2.waitForMessage();

    expect(response1).toContain('$$');
    expect(response2).toContain('$$');
    expect(response1).toBe(response2);

    client1.close();
    client2.close();
  });

  it('should handle client disconnection gracefully', async () => {
    const client = createTestClient(`ws://localhost:${TEST_PORT}`);
    await client.connect();

    client.close();
    await client.waitForClose();

    expect(client.isConnected()).toBe(false);
  });

  it('should assign unique IDs to clients', async () => {
    const client1 = createTestClient(`ws://localhost:${TEST_PORT}`);
    const client2 = createTestClient(`ws://localhost:${TEST_PORT}`);

    await client1.connect();
    await client2.connect();

    const clients = server.getClients();
    expect(clients.length).toBe(2);

    const ids = clients.map((c) => c.id);
    expect(new Set(ids).size).toBe(2); // All IDs should be unique

    client1.close();
    client2.close();
  });

  it('should track client count correctly', async () => {
    expect(server.getClientCount()).toBe(0);

    const client1 = createTestClient(`ws://localhost:${TEST_PORT}`);
    await client1.connect();
    expect(server.getClientCount()).toBe(1);

    const client2 = createTestClient(`ws://localhost:${TEST_PORT}`);
    await client2.connect();
    expect(server.getClientCount()).toBe(2);

    client1.close();
    await new Promise((r) => setTimeout(r, 100)); // Give server time to process
    expect(server.getClientCount()).toBe(1);

    client2.close();
  });

  it('should stop server cleanly', async () => {
    const client = createTestClient(`ws://localhost:${TEST_PORT}`);
    await client.connect();

    await server.stop();

    expect(server.isRunning()).toBe(false);
    await client.waitForClose();
  });
});
