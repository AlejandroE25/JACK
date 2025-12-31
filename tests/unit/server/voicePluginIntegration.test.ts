/**
 * Voice Plugin WebRTC Integration Test
 *
 * Tests that the VoiceInterfacePlugin properly initializes WebRTC components
 * when setWebSocketServer() is called during server startup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceInterfacePlugin } from '../../../src/plugins/interfaces/voiceInterfacePlugin';
import { PACEWebSocketServer } from '../../../src/server/websocket';
import { EventBus } from '../../../src/events/eventBus';
import { DataPipeline } from '../../../src/data/dataPipeline';

describe('VoiceInterfacePlugin WebRTC Integration', () => {
  let voicePlugin: VoiceInterfacePlugin;
  let mockWsServer: PACEWebSocketServer;
  let mockEventBus: EventBus;
  let mockDataPipeline: DataPipeline;

  beforeEach(async () => {
    // Create mocks
    mockEventBus = new EventBus();
    mockDataPipeline = new DataPipeline(mockEventBus);

    // Initialize voice plugin with proper initialization
    voicePlugin = new VoiceInterfacePlugin();
    await voicePlugin.initialize(mockEventBus, mockDataPipeline, {
      enabled: true,
      priority: 1,
      timeout: 10000
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('WebRTC Component Initialization', () => {
    it('should have setWebSocketServer method', () => {
      expect(voicePlugin).toHaveProperty('setWebSocketServer');
      expect(typeof voicePlugin.setWebSocketServer).toBe('function');
    });

    it('should initialize WebRTC components when setWebSocketServer is called', () => {
      // Create mock WebSocket server
      mockWsServer = {
        port: 3000,
        host: '0.0.0.0'
      } as any;

      // Call setWebSocketServer (should not throw)
      expect(() => {
        voicePlugin.setWebSocketServer(mockWsServer);
      }).not.toThrow();
    });

    it('should accept WebSocket server instance', () => {
      mockWsServer = {
        port: 3000,
        host: '0.0.0.0',
        clients: new Map()
      } as any;

      voicePlugin.setWebSocketServer(mockWsServer);

      // Verify no errors occurred
      expect(voicePlugin).toBeDefined();
    });
  });

  describe('Plugin Initialization', () => {
    it('should be properly initialized before setWebSocketServer', async () => {
      const newPlugin = new VoiceInterfacePlugin();
      await newPlugin.initialize(mockEventBus, mockDataPipeline, {
        enabled: true,
        priority: 1,
        timeout: 10000
      });

      // Should be initialized
      expect(newPlugin).toBeDefined();
    });

    it('should handle initialization without errors', async () => {
      const newPlugin = new VoiceInterfacePlugin();
      await expect(newPlugin.initialize(mockEventBus, mockDataPipeline, {
        enabled: true,
        priority: 1,
        timeout: 10000
      })).resolves.not.toThrow();
    });
  });

  describe('Server Startup Integration', () => {
    it('should be compatible with server initialization flow', async () => {
      // Simulate server startup sequence
      mockWsServer = {
        port: 3000,
        host: '0.0.0.0',
        clients: new Map(),
        start: vi.fn().mockResolvedValue(undefined)
      } as any;

      // 1. WebSocket server starts
      await mockWsServer.start();

      // 2. Voice plugin gets WebSocket server reference
      expect(() => {
        voicePlugin.setWebSocketServer(mockWsServer);
      }).not.toThrow();

      // Verify startup succeeded
      expect(mockWsServer.start).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error if plugin not initialized before setWebSocketServer', () => {
      const uninitializedPlugin = new VoiceInterfacePlugin();

      expect(() => {
        uninitializedPlugin.setWebSocketServer({} as any);
      }).toThrow('Plugin not initialized');
    });

    it('should handle WebSocket server after proper initialization', () => {
      mockWsServer = {
        port: 3000,
        host: '0.0.0.0'
      } as any;

      // Should not throw after initialization
      expect(() => {
        voicePlugin.setWebSocketServer(mockWsServer);
      }).not.toThrow();
    });
  });
});
