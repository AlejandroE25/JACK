/**
 * API Routes
 *
 * Express routes for REST API endpoints.
 */

import express, { Request, Response } from 'express';
import { getConfig, updateConfig, deleteConfigKeys } from './configController.js';
import { spawn, type ChildProcess } from 'child_process';
import { config } from '../../config/index.js';

export const apiRouter = express.Router();

/**
 * Create WAV file header for raw PCM data
 * PCM format: 16-bit signed integer, mono, 22050 Hz
 */
function createWavHeader(pcmData: Buffer): Buffer {
  const sampleRate = 22050;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const fileSize = 44 + dataSize;

  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize - 8, 4);
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  // Combine header + PCM data
  return Buffer.concat([header, pcmData]);
}

/**
 * GET /api/config
 * Get current environment configuration (with masked sensitive values)
 */
apiRouter.get('/config', async (req: Request, res: Response) => {
  const authToken = req.headers.authorization?.replace('Bearer ', '');

  if (!authToken) {
    return res.status(401).json({
      success: false,
      error: 'Missing authorization token'
    });
  }

  const result = await getConfig(authToken);

  if (!result.success) {
    return res.status(401).json(result);
  }

  return res.json(result);
});

/**
 * POST /api/config
 * Update environment configuration
 *
 * Body: { "KEY": "value", "ANOTHER_KEY": "another_value" }
 */
apiRouter.post('/config', async (req: Request, res: Response) => {
  const authToken = req.headers.authorization?.replace('Bearer ', '');

  if (!authToken) {
    return res.status(401).json({
      success: false,
      error: 'Missing authorization token'
    });
  }

  const updates = req.body;

  const result = await updateConfig(authToken, updates);

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

/**
 * DELETE /api/config
 * Delete environment variables
 *
 * Body: { "keys": ["KEY1", "KEY2"] }
 */
apiRouter.delete('/config', async (req: Request, res: Response) => {
  const authToken = req.headers.authorization?.replace('Bearer ', '');

  if (!authToken) {
    return res.status(401).json({
      success: false,
      error: 'Missing authorization token'
    });
  }

  const { keys } = req.body;

  if (!Array.isArray(keys)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request format. Expected: { "keys": ["KEY1", "KEY2"] }'
    });
  }

  const result = await deleteConfigKeys(authToken, keys);

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

/**
 * GET /api/health
 * Health check endpoint
 */
apiRouter.get('/health', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/speech/test
 * Test Piper TTS - generates and downloads WAV file
 *
 * Query params:
 *   text (optional): Text to synthesize (default: "Hello, this is a test of the Piper text to speech system.")
 *
 * Example: http://10.0.0.69:9001/api/speech/test?text=Hello world
 */
apiRouter.get('/speech/test', async (req: Request, res: Response) => {
  const text = (req.query.text as string) || "Hello, this is a test of the Piper text to speech system.";

  console.log(`[TTS Test] Generating audio for: "${text}"`);

  try {
    // Spawn Piper process
    // Use --output-raw for clean PCM output (no WAV header contamination)
    const piperProcess: ChildProcess = spawn(
      config.piperPath || '/usr/local/bin/piper',
      [
        '--model', config.piperModelPath || '/usr/local/share/piper/voices/en_US-lessac-medium.onnx',
        '--output-raw'
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe']
        // NOTE: Do NOT use shell: true - it breaks paths with spaces on Windows
        // spawn() handles quoted paths correctly without shell mode
      }
    );

    const audioChunks: Buffer[] = [];
    let stderrOutput = '';

    // Collect audio data
    piperProcess.stdout?.on('data', (chunk: Buffer) => {
      audioChunks.push(chunk);
    });

    // Collect stderr
    piperProcess.stderr?.on('data', (data: Buffer) => {
      stderrOutput += data.toString();
    });

    // Handle errors
    piperProcess.on('error', (error: Error) => {
      console.error('[TTS Test] Piper process error:', error);
      res.status(500).json({
        success: false,
        error: `Piper process error: ${error.message}`
      });
    });

    // Handle completion
    piperProcess.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error(`[TTS Test] Piper exited with code ${code}:`, stderrOutput);
        res.status(500).json({
          success: false,
          error: `Piper exited with code ${code}: ${stderrOutput}`
        });
        return;
      }

      // Concatenate all PCM chunks
      const pcmBuffer = Buffer.concat(audioChunks);

      // Create WAV header for PCM data (16-bit, mono, 22050 Hz)
      const wavBuffer = createWavHeader(pcmBuffer);

      console.log(`[TTS Test] Generated ${wavBuffer.length} bytes of audio (${pcmBuffer.length} PCM bytes)`);

      // Send WAV file as download
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', 'attachment; filename="test.wav"');
      res.setHeader('Content-Length', wavBuffer.length);
      res.send(wavBuffer);
    });

    // Write text to stdin with explicit UTF-8 encoding
    // Add newline to match PowerShell pipe behavior
    if (piperProcess.stdin) {
      piperProcess.stdin.write(text + '\n', 'utf8');
      piperProcess.stdin.end();
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to write to Piper stdin'
      });
    }

  } catch (error: any) {
    console.error('[TTS Test] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
});
