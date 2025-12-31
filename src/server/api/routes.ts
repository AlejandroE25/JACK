/**
 * API Routes
 *
 * Express routes for REST API endpoints.
 */

import express, { Request, Response } from 'express';
import { getConfig, updateConfig, deleteConfigKeys } from './configController.js';

export const apiRouter = express.Router();

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
