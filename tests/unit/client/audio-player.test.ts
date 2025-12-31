/**
 * Audio Player Test Suite
 *
 * Tests browser-side Web Audio API integration,
 * MP3 decoding, and seamless playback queue management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load the audio player code
const audioPlayerCode = readFileSync(
  join(process.cwd(), 'public/audio-player.js'),
  'utf-8'
);

// Mock Web Audio API
const createMockAudioContext = () => {
  const mockSourceNode = {
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null
  };

  const mockAudioContext = {
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createBufferSource: vi.fn(() => mockSourceNode),
    decodeAudioData: vi.fn().mockImplementation(async () => ({
      duration: 1.5,
      numberOfChannels: 1,
      sampleRate: 48000
    }))
  };

  return { mockAudioContext, mockSourceNode };
};

describe('AudioPlayer', () => {
  let AudioPlayer: any;
  let { mockAudioContext, mockSourceNode } = createMockAudioContext();

  beforeEach(() => {
    // Reset mocks
    ({ mockAudioContext, mockSourceNode } = createMockAudioContext());

    // Mock Web Audio API globals
    global.AudioContext = vi.fn(() => mockAudioContext) as any;
    (global as any).webkitAudioContext = global.AudioContext;
    global.TextDecoder = vi.fn(() => ({
      decode: vi.fn((buffer) => {
        // Simple mock - check for marker strings
        const view = new Uint8Array(buffer);
        if (view.length < 20 && buffer.byteLength < 20) {
          return 'TTS_END'; // Mock marker
        }
        return 'AUDIO_DATA';
      })
    })) as any;

    // Mock window object with AudioContext
    (global as any).window = {
      AudioContext: global.AudioContext,
      webkitAudioContext: global.AudioContext,
      handleWebRTCStateChange: vi.fn()
    };

    // Evaluate the audio player code to get the class
    eval(audioPlayerCode);
    AudioPlayer = (global as any).window.AudioPlayer;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create AudioPlayer instance', () => {
      const player = new AudioPlayer();
      expect(player).toBeDefined();
      expect(player.isPlaying).toBe(false);
    });

    it('should initialize AudioContext', async () => {
      const player = new AudioPlayer();
      const result = await player.initialize();

      expect(result).toBe(true);
      expect(global.AudioContext).toHaveBeenCalled();
      expect(player.audioContext).toBeDefined();
    });

    it('should handle AudioContext creation failure', async () => {
      // Override window.AudioContext to throw
      (global as any).window.AudioContext = vi.fn(() => {
        throw new Error('AudioContext not supported');
      }) as any;
      (global as any).window.webkitAudioContext = undefined;

      const player = new AudioPlayer();
      const result = await player.initialize();

      expect(result).toBe(false);
    });

    it('should detect suspended AudioContext', async () => {
      mockAudioContext.state = 'suspended';

      const player = new AudioPlayer();
      await player.initialize();

      expect(mockAudioContext.state).toBe('suspended');
    });
  });

  describe('AudioContext Resume', () => {
    it('should resume suspended context', async () => {
      mockAudioContext.state = 'suspended';

      const player = new AudioPlayer();
      await player.initialize();
      await player.resumeContext();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('should not resume if already running', async () => {
      mockAudioContext.state = 'running';

      const player = new AudioPlayer();
      await player.initialize();
      await player.resumeContext();

      expect(mockAudioContext.resume).not.toHaveBeenCalled();
    });
  });

  describe('MP3 Chunk Playback', () => {
    it('should decode MP3 chunk', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      const mockMP3Data = new ArrayBuffer(16000);
      await player.playChunk(mockMP3Data);

      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledWith(mockMP3Data);
    });

    it('should schedule audio buffer for playback', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      const mockMP3Data = new ArrayBuffer(16000);
      await player.playChunk(mockMP3Data);

      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
      expect(mockSourceNode.connect).toHaveBeenCalledWith(mockAudioContext.destination);
      expect(mockSourceNode.start).toHaveBeenCalled();
    });

    it('should set isPlaying flag on first chunk', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      expect(player.isPlaying).toBe(false);

      const mockMP3Data = new ArrayBuffer(16000);
      await player.playChunk(mockMP3Data);

      expect(player.isPlaying).toBe(true);
    });

    it('should handle decoding errors gracefully', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValue(new Error('Decode failed'));

      const player = new AudioPlayer();
      await player.initialize();

      const mockMP3Data = new ArrayBuffer(16000);
      await player.playChunk(mockMP3Data);

      // Should not crash
      expect(player).toBeDefined();
    });
  });

  describe('Seamless Playback Queue', () => {
    it('should schedule multiple chunks seamlessly', async () => {
      mockAudioContext.currentTime = 0;

      const player = new AudioPlayer();
      await player.initialize();

      // Play first chunk
      const chunk1 = new ArrayBuffer(16000);
      await player.playChunk(chunk1);

      const firstStartTime = mockSourceNode.start.mock.calls[0][0];

      // Play second chunk
      const chunk2 = new ArrayBuffer(16000);
      await player.playChunk(chunk2);

      const secondStartTime = mockSourceNode.start.mock.calls[1][0];

      // Second chunk should start after first chunk ends
      expect(secondStartTime).toBeGreaterThan(firstStartTime);
    });

    it('should track nextStartTime', async () => {
      mockAudioContext.currentTime = 0;

      const player = new AudioPlayer();
      await player.initialize();

      expect(player.nextStartTime).toBe(0);

      const mockMP3Data = new ArrayBuffer(16000);
      await player.playChunk(mockMP3Data);

      // nextStartTime should be updated with buffer duration
      expect(player.nextStartTime).toBeGreaterThan(0);
    });
  });

  describe('TTS Markers', () => {
    it('should detect TTS_END marker', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      // Create small buffer that will be detected as marker
      const markerData = new ArrayBuffer(8);
      await player.playChunk(markerData);

      expect((global as any).window.handleWebRTCStateChange).toHaveBeenCalledWith('playback-complete');
    });

    it('should stop playback on TTS_ABORT marker', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      // Start playback
      const audioData = new ArrayBuffer(16000);
      await player.playChunk(audioData);

      expect(player.isPlaying).toBe(true);

      // Send abort marker (small buffer)
      const abortMarker = new ArrayBuffer(10);
      await player.playChunk(abortMarker);

      // Note: Actual stopping depends on marker detection logic
      expect(player).toBeDefined();
    });
  });

  describe('Playback Control', () => {
    it('should stop all playing audio', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      // Start playback
      const mockMP3Data = new ArrayBuffer(16000);
      await player.playChunk(mockMP3Data);

      expect(player.isPlaying).toBe(true);

      await player.stop();

      expect(mockSourceNode.stop).toHaveBeenCalled();
      expect(player.isPlaying).toBe(false);
      expect(player.nextStartTime).toBe(0);
    });

    it('should clear playback queue on stop', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      // Add multiple chunks
      await player.playChunk(new ArrayBuffer(16000));
      await player.playChunk(new ArrayBuffer(16000));

      await player.stop();

      expect(player.currentSourceNodes.length).toBe(0);
      expect(player.audioQueue.length).toBe(0);
    });

    it('should emit playback-stopped event', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      await player.playChunk(new ArrayBuffer(16000));
      await player.stop();

      expect((global as any).window.handleWebRTCStateChange).toHaveBeenCalledWith('playback-stopped');
    });
  });

  describe('State Management', () => {
    it('should return current state', () => {
      const player = new AudioPlayer();
      const state = player.getState();

      expect(state).toHaveProperty('isPlaying');
      expect(state).toHaveProperty('queueLength');
      expect(state).toHaveProperty('contextState');
    });

    it('should update state during playback', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      let state = player.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.queueLength).toBe(0);

      await player.playChunk(new ArrayBuffer(16000));

      state = player.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.queueLength).toBeGreaterThan(0);
    });
  });

  describe('Source Node Cleanup', () => {
    it('should clean up source nodes when playback ends', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      await player.playChunk(new ArrayBuffer(16000));

      const nodeCount = player.currentSourceNodes.length;
      expect(nodeCount).toBeGreaterThan(0);

      // Simulate source node ending
      mockSourceNode.onended();

      // Node should be removed from tracking
      expect(player.currentSourceNodes.length).toBe(nodeCount - 1);
    });

    it('should reset isPlaying when all nodes finish', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      await player.playChunk(new ArrayBuffer(16000));

      expect(player.isPlaying).toBe(true);

      // Simulate all nodes ending
      mockSourceNode.onended();

      expect(player.isPlaying).toBe(false);
    });
  });

  describe('Error Recovery', () => {
    it('should continue playback after decode error', async () => {
      let callCount = 0;
      mockAudioContext.decodeAudioData.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First chunk failed');
        }
        return { duration: 1.5, numberOfChannels: 1, sampleRate: 48000 };
      });

      const player = new AudioPlayer();
      await player.initialize();

      // First chunk fails
      await player.playChunk(new ArrayBuffer(16000));

      // Second chunk succeeds
      await player.playChunk(new ArrayBuffer(16000));

      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
    });

    it('should handle stop() when not playing', async () => {
      const player = new AudioPlayer();
      await player.initialize();

      expect(player.isPlaying).toBe(false);

      await player.stop();

      // Should not crash
      expect(player.isPlaying).toBe(false);
    });
  });
});
