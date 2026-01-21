/**
 * Audio Player
 * Decodes audio chunks (WAV from Piper TTS) and plays using Web Audio API
 */

class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.audioQueue = [];
    this.nextStartTime = 0;
    this.currentSourceNodes = [];

    // Audio-reactive blob visualization
    this.analyser = null;
    this.animationId = null;

    console.log('[AudioPlayer] Initialized');
  }

  /**
   * Initialize Web Audio API context
   */
  async initialize() {
    try {
      // CRITICAL: Force AudioContext to 22050 Hz to match Piper's output
      // Piper ignores --sample-rate flag and always outputs at 22050 Hz
      // Browser default is 48000 Hz which causes 2.18x speed (garbled audio)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 22050
      });

      console.log('[AudioPlayer] AudioContext created with forced 22050 Hz:', {
        requestedRate: 22050,
        actualRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });

      // Create analyser for audio-reactive blob visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // FFT size for frequency analysis
      this.analyser.smoothingTimeConstant = 0.8; // Smooth animation
      this.analyser.connect(this.audioContext.destination);

      // Resume context if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        console.log('[AudioPlayer] AudioContext suspended, will resume on user interaction');
      }

      console.log('[AudioPlayer] AudioContext created with audio-reactive visualization');
      return true;
    } catch (error) {
      console.error('[AudioPlayer] Failed to initialize AudioContext:', error);
      return false;
    }
  }

  /**
   * Resume audio context (call on user interaction for autoplay policy)
   */
  async resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('[AudioPlayer] AudioContext resumed');
    }
  }

  /**
   * Play an audio chunk (WAV from Piper TTS)
   */
  async playChunk(audioArrayBuffer) {
    try {
      // Resume context if needed (browser autoplay policy)
      await this.resumeContext();

      // Check for special markers
      if (this._isMarker(audioArrayBuffer)) {
        const marker = this._getMarkerType(audioArrayBuffer);
        console.log('[AudioPlayer] Received marker:', marker);

        if (marker === 'TTS_END') {
          // TTS_END now just signals end of stream - don't need to do anything
          // Chunks are already playing as they arrive
          console.log('[AudioPlayer] TTS_END marker received (all chunks already playing)');
          return;
        } else if (marker === 'TTS_ABORT') {
          await this.stop();
          return;
        }
      }

      // Decode and play immediately (don't wait for TTS_END)
      // Each chunk from Piper is a complete WAV file - play as soon as it arrives
      console.log(`[AudioPlayer] Decoding chunk immediately (${audioArrayBuffer.byteLength} bytes)`);
      const audioBuffer = await this.audioContext.decodeAudioData(audioArrayBuffer);

      console.log(`[AudioPlayer] Decoded chunk:`, {
        duration: audioBuffer.duration.toFixed(2) + 's',
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        contextRate: this.audioContext.sampleRate
      });

      // Schedule it for immediate playback
      this._scheduleBuffer(audioBuffer);

    } catch (error) {
      console.error('[AudioPlayer] Error playing chunk:', error);
      // Continue playing - don't let one bad chunk stop everything
    }
  }

  /**
   * Check if data is a text marker instead of audio
   */
  _isMarker(data) {
    if (data instanceof ArrayBuffer && data.byteLength < 20) {
      const text = new TextDecoder().decode(data);
      return text.startsWith('TTS_');
    }
    return false;
  }

  /**
   * Get marker type from data
   */
  _getMarkerType(data) {
    return new TextDecoder().decode(data);
  }


  /**
   * Schedule audio buffer for playback
   */
  _scheduleBuffer(audioBuffer) {
    const currentTime = this.audioContext.currentTime;

    // If not playing, start immediately
    if (!this.isPlaying) {
      this.nextStartTime = currentTime;
      this.isPlaying = true;
    }

    // Create source node
    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    // Connect through analyser for waveform visualization
    sourceNode.connect(this.analyser);

    // Schedule playback
    sourceNode.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    // Track source node
    this.currentSourceNodes.push(sourceNode);

    // Start waveform visualization
    if (this.currentSourceNodes.length === 1) {
      this.startWaveformVisualization();
    }

    // Clean up when finished
    sourceNode.onended = () => {
      const index = this.currentSourceNodes.indexOf(sourceNode);
      if (index > -1) {
        this.currentSourceNodes.splice(index, 1);
      }

      // If no more chunks are playing, reset state and stop visualization
      if (this.currentSourceNodes.length === 0) {
        this.isPlaying = false;
        this.nextStartTime = 0;
        this.stopWaveformVisualization();
      }
    };

    console.log(`[AudioPlayer] Scheduled chunk (duration: ${audioBuffer.duration.toFixed(2)}s, start: ${this.nextStartTime.toFixed(2)}s)`);
  }


  /**
   * Stop playback immediately
   */
  async stop() {
    console.log('[AudioPlayer] Stopping playback');

    // Stop all currently playing audio
    this.currentSourceNodes.forEach(node => {
      try {
        node.stop();
      } catch (e) {
        // Node might already be stopped
      }
    });

    this.currentSourceNodes = [];
    this.audioQueue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;

    // Stop waveform visualization
    this.stopWaveformVisualization();

    // Dispatch event for UI updates
    if (window.handleWebRTCStateChange) {
      window.handleWebRTCStateChange('playback-stopped');
    }
  }

  /**
   * Start audio-reactive background blob visualization
   */
  startWaveformVisualization() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Get references to background blobs
    const blob1 = document.getElementById('blob1');
    const blob2 = document.getElementById('blob2');

    if (!blob1 || !blob2) {
      console.warn('[AudioPlayer] Background blobs not found');
      return;
    }

    // Add audio-active class for color change
    blob1.classList.add('audio-active');
    blob2.classList.add('audio-active');

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);

      // Get frequency data
      this.analyser.getByteFrequencyData(dataArray);

      // Calculate low and high frequency components
      const lowFreq = dataArray.slice(0, bufferLength / 3).reduce((sum, v) => sum + v, 0) / (bufferLength / 3) / 255;
      const highFreq = dataArray.slice(bufferLength * 2 / 3).reduce((sum, v) => sum + v, 0) / (bufferLength / 3) / 255;

      // Modulate blob1 with low frequencies (bass) - MORE AGGRESSIVE
      const blob1Scale = 1 + (lowFreq * 1.2); // Scale 1.0 - 2.2x
      const blob1Blur = 100 + (lowFreq * 100); // Blur 100-200px
      const blob1Opacity = 0.8 + (lowFreq * 0.2); // Opacity 0.8-1.0

      // Apply transform (preserve CSS animation)
      blob1.style.setProperty('--audio-scale', blob1Scale);
      blob1.style.filter = `blur(${blob1Blur}px) opacity(${blob1Opacity})`;

      // Modulate blob2 with high frequencies (treble) - MORE AGGRESSIVE
      const blob2Scale = 1 + (highFreq * 1.2); // Scale 1.0 - 2.2x
      const blob2Blur = 100 + (highFreq * 100); // Blur 100-200px
      const blob2Opacity = 0.8 + (highFreq * 0.2); // Opacity 0.8-1.0

      // Apply transform (preserve CSS animation)
      blob2.style.setProperty('--audio-scale', blob2Scale);
      blob2.style.filter = `blur(${blob2Blur}px) opacity(${blob2Opacity})`;
    };

    draw();
    console.log('[AudioPlayer] Audio-reactive background blob visualization started');
  }

  /**
   * Stop blob visualization and reset to default state
   */
  stopWaveformVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Reset blobs to default appearance
    const blob1 = document.getElementById('blob1');
    const blob2 = document.getElementById('blob2');

    if (blob1) {
      blob1.classList.remove('audio-active');
      blob1.style.removeProperty('--audio-scale');
      blob1.style.filter = '';
    }

    if (blob2) {
      blob2.classList.remove('audio-active');
      blob2.style.removeProperty('--audio-scale');
      blob2.style.filter = '';
    }

    console.log('[AudioPlayer] Blob visualization stopped');
  }

  /**
   * Get current playback state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      queueLength: this.currentSourceNodes.length,
      contextState: this.audioContext ? this.audioContext.state : 'null'
    };
  }
}

// Make it available globally
window.AudioPlayer = AudioPlayer;
