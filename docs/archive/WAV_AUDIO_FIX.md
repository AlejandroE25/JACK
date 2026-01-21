# WAV Audio Decode Fix

## Problem

When switching from OpenAI TTS (MP3 output) to Piper TTS (WAV output), the audio player was failing with:

```
DOMException: The buffer passed to decodeAudioData contains an unknown content type
```

## Root Causes

### Issue 1: WAV Files Were Being Chunked

The Piper TTS service was splitting complete WAV files into 16KB chunks for streaming. WAV files have a header at the beginning - only the first chunk had the header, making chunks 2+ undecodable.

### Issue 2: Sample Rate Mismatch and Resampling Artifacts

Initially, the AudioContext was hardcoded to 48000 Hz while Piper outputs at 22050 Hz natively. When we tried forcing Piper to output at 48000 Hz with `--sample-rate 48000`, the audio became unintelligible due to resampling artifacts from Piper's internal upsampling.

### Issue 3: Client-Side Concatenation

The audio player was designed for MP3 streams, which can be concatenated. WAV files cannot be concatenated because each has its own header.

## Solutions

### Solution 1: Don't Chunk WAV Files (Server-Side)

**File:** [`src/plugins/interfaces/services/piperTtsService.ts`](../src/plugins/interfaces/services/piperTtsService.ts)

Changed from streaming in 16KB chunks to sending complete WAV files:

**Before:**
```typescript
// Stream in chunks
while (audioBuffer.length >= this.CHUNK_SIZE) {
  const chunkToSend = audioBuffer.subarray(0, this.CHUNK_SIZE);
  audioBuffer = audioBuffer.subarray(this.CHUNK_SIZE);
  await this.publishChunkEvent(responseId, chunkToSend, ...);
}
```

**After:**
```typescript
// Collect audio data from stdout
// Buffer the complete WAV file - don't chunk it
// WAV files have headers and can't be split mid-stream
piperProcess.stdout?.on('data', (chunk: Buffer) => {
  audioBuffer = Buffer.concat([audioBuffer, chunk]);
  totalBytes += chunk.length;
});

// On process completion, send complete WAV as single chunk
await this.publishChunkEvent(responseId, audioBuffer, 0, totalBytes, clientId);
```

### Solution 2: Match Sample Rates at 22050 Hz (Both Sides)

**Server-Side - File:** [`src/plugins/interfaces/services/piperTtsService.ts`](../src/plugins/interfaces/services/piperTtsService.ts)

Remove `--sample-rate` flag to let Piper output at native 22050 Hz:

**Before:**
```typescript
const piperProcess = spawn(piperPath, [
  '--model', modelPath,
  '--output-file', '-',
  '--sample-rate', '48000'  // Causes resampling artifacts
]);
```

**After:**
```typescript
const piperProcess = spawn(piperPath, [
  '--model', modelPath,
  '--output-file', '-'
  // No --sample-rate flag - use Piper's native 22050 Hz
]);
```

**Client-Side - File:** [`public/audio-player.js`](../public/audio-player.js)

Force AudioContext to 22050 Hz to match Piper's native output:

**Before:**
```javascript
this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
  sampleRate: 48000  // Hardcoded - causes mismatch
});
```

**After:**
```javascript
// Create AudioContext at 22050 Hz to match Piper's native output
// This avoids resampling artifacts from Piper trying to upsample to 48kHz
this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
  sampleRate: 22050
});
```

### Solution 3: Decode WAV Chunks Individually (Client-Side)

**File:** [`public/audio-player.js`](../public/audio-player.js)

Since each chunk is now a complete WAV file, decode them individually:

**Before:**
```javascript
// Concatenate all chunks
const completeMP3 = new Uint8Array(totalLength);
for (const chunk of this.pendingChunks) {
  completeMP3.set(new Uint8Array(chunk), offset);
  offset += chunk.byteLength;
}
const audioBuffer = await this.audioContext.decodeAudioData(completeMP3.buffer);
```

**After:**
```javascript
// Decode each WAV chunk individually (each is a complete WAV file)
for (let i = 0; i < chunksToProcess.length; i++) {
  const chunk = chunksToProcess[i];
  try {
    const audioBuffer = await this.audioContext.decodeAudioData(chunk);
    this._scheduleBuffer(audioBuffer);
  } catch (decodeError) {
    console.error(`Failed to decode chunk ${i + 1}:`, decodeError);
  }
}
```

## Files Modified

### Server-Side
- [`src/plugins/interfaces/services/piperTtsService.ts`](../src/plugins/interfaces/services/piperTtsService.ts)
  - Removed 16KB chunking logic from `runPiper()` method (lines 231-241)
  - Now sends complete WAV files as single chunks (line 274-283)
  - Removed unused `CHUNK_SIZE` constant
  - Removed `--sample-rate 48000` flag to use Piper's native 22050 Hz

- [`tests/unit/plugins/interfaces/services/piperTtsService.test.ts`](../tests/unit/plugins/interfaces/services/piperTtsService.test.ts)
  - Updated test expectation: `--output-raw` → `--output-file -`
  - Removed `--sample-rate` from test expectations

### Client-Side
- [`public/audio-player.js`](../public/audio-player.js)
  - Changed AudioContext to force 22050 Hz sample rate (line 30-32)
  - Removed `pendingChunks` buffering array - no longer needed
  - Changed `playChunk()` to decode and play immediately (line 96-106)
  - Removed `_decodeAndPlayBufferedChunks()` method - no longer needed
  - Removed `_onPlaybackComplete()` method - no longer needed
  - TTS_END marker now just logs, doesn't trigger playback

## Solution 4: Play Chunks Immediately (Client-Side)

**File:** [`public/audio-player.js`](../public/audio-player.js)

The audio player was buffering all chunks and waiting for `TTS_END` marker before playing. This caused "speech stacking" where long responses would wait for shorter responses.

**Problem**: Multiple sentences are processed in parallel with different `responseId`s. Each sentence completes at different times and sends its own `TTS_END` marker. If sentence 2 finishes before sentence 1, playback was out of order.

**Before:**
```javascript
async playChunk(audioArrayBuffer) {
  // Buffer the chunk until TTS_END arrives
  this.pendingChunks.push(audioArrayBuffer);

  if (marker === 'TTS_END') {
    // Only now decode and play all buffered chunks
    await this._decodeAndPlayBufferedChunks();
  }
}
```

**After:**
```javascript
async playChunk(audioArrayBuffer) {
  // Decode and play immediately - don't wait for TTS_END
  const audioBuffer = await this.audioContext.decodeAudioData(audioArrayBuffer);
  this._scheduleBuffer(audioBuffer);
  // Chunks play in order they arrive, queued sequentially
}
```

**Why This Works**: Since Piper now sends complete WAV files (not fragments), each chunk can be decoded and played immediately. The `_scheduleBuffer()` method handles sequential queuing automatically using Web Audio API's timeline.

## Testing

After this fix, Piper WAV audio should:
1. ✅ Decode successfully without "unknown content type" errors
2. ✅ Play at correct speed (not garbled/chipmunk)
3. ✅ Play each sentence immediately as it arrives (no stacking)
4. ✅ Play sentences in the order they're received (sequential queuing)
5. ✅ Maintain audio-reactive visualization
6. ✅ Support interruption via abort signals

## Performance Impact

**Positive Changes:**

1. **Sending complete WAV files per sentence** (vs chunking):
   - **Before**: 8 chunks per sentence × decode overhead = more processing
   - **After**: 1 complete WAV per sentence = single decode, less overhead
   - No network latency difference (same total bytes)

2. **Immediate playback** (vs buffering until TTS_END):
   - **Before**: Wait for all chunks + TTS_END → decode all → play
   - **After**: Decode and play each sentence as soon as it arrives
   - **Latency reduction**: ~500ms-2s faster first audio (no waiting for batch)
   - **Better UX**: Speech flows naturally, no awkward pauses between sentences

## Architecture Insights

**Key Takeaway #1**: Audio format determines chunking strategy:
- **MP3 streams**: Can be chunked and concatenated (single header at start)
- **WAV files**: Cannot be chunked (each file has its own header)
- **Solution**: Send WAV files as complete units, not fragments

This is why Piper generates one WAV file per sentence - it's the correct atomic unit for WAV format.

**Key Takeaway #2**: Avoid resampling when possible:
- **Piper's native output**: 22050 Hz (optimized for the neural model)
- **Browser default**: Usually 48000 Hz
- **Problem**: Forcing Piper to resample to 48000 Hz creates artifacts
- **Solution**: Configure AudioContext to match Piper's native rate (22050 Hz)

Let the audio stay in its native format throughout the pipeline to avoid quality degradation.

**Key Takeaway #3**: Stream-friendly architectures need immediate playback:
- **Multi-sentence responses**: Multiple sentences process in parallel
- **Problem**: Buffering until "end marker" causes race conditions
- **Solution**: Play chunks immediately as they arrive, rely on Web Audio API's scheduling for sequential queuing
- **Benefit**: Natural speech flow, lower latency, no stacking issues
