# WAV Audio Decode Fix

## Problem

When switching from OpenAI TTS (MP3 output) to Piper TTS (WAV output), the audio player was failing with:

```
DOMException: The buffer passed to decodeAudioData contains an unknown content type
```

## Root Causes

### Issue 1: WAV Files Were Being Chunked

The Piper TTS service was splitting complete WAV files into 16KB chunks for streaming. WAV files have a header at the beginning - only the first chunk had the header, making chunks 2+ undecodable.

### Issue 2: Sample Rate Mismatch

The AudioContext was hardcoded to 48000 Hz, but Piper outputs at 22050 Hz, causing audio to play at 2.18x speed (garbled/chipmunk effect).

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

### Solution 2: Remove Sample Rate Override (Client-Side)

**File:** [`public/audio-player.js`](../public/audio-player.js)

**Before:**
```javascript
this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
  sampleRate: 48000  // Hardcoded - causes mismatch
});
```

**After:**
```javascript
// Create AudioContext with default sample rate
// This will automatically match the audio file's sample rate (Piper outputs 22050 Hz)
this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

- [`tests/unit/plugins/interfaces/services/piperTtsService.test.ts`](../tests/unit/plugins/interfaces/services/piperTtsService.test.ts)
  - Updated test expectation: `--output-raw` → `--output-file -`

### Client-Side
- [`public/audio-player.js`](../public/audio-player.js)
  - Removed hardcoded 48000 Hz sample rate from AudioContext initialization (line 29)
  - Updated `_decodeAndPlayBufferedChunks()` to decode WAV chunks individually (lines 152-169)
  - Renamed method `_decodeMP3Chunk()` → `_decodeAudioChunk()`
  - Updated comments from "MP3" to generic "audio"

## Testing

After this fix, Piper WAV audio should:
1. ✅ Decode successfully without "unknown content type" errors
2. ✅ Play at correct speed (not garbled/chipmunk)
3. ✅ Play each sentence sequentially
4. ✅ Maintain audio-reactive visualization
5. ✅ Support interruption via abort signals

## Performance Impact

**Positive:** Sending complete WAV files per sentence actually improves performance:
- **Before**: 8 chunks per sentence × decode overhead = more processing
- **After**: 1 complete WAV per sentence = single decode, less overhead
- No network latency difference (same total bytes)

## Architecture Insight

**Key Takeaway**: Audio format determines chunking strategy:
- **MP3 streams**: Can be chunked and concatenated (single header at start)
- **WAV files**: Cannot be chunked (each file has its own header)
- **Solution**: Send WAV files as complete units, not fragments

This is why Piper generates one WAV file per sentence - it's the correct atomic unit for WAV format.
