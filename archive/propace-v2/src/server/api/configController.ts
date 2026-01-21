/**
 * Configuration API Controller
 *
 * Provides secure endpoints for managing environment variables remotely.
 * Requires authentication token for all operations.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';

/**
 * Authentication token for config updates
 * In production, this should be set via environment variable
 */
const CONFIG_AUTH_TOKEN = process.env.CONFIG_AUTH_TOKEN || 'change-me-in-production';

/**
 * Path to .env file
 */
const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

/**
 * Validate authentication token
 */
export function validateAuthToken(token: string): boolean {
  if (!token) {
    return false;
  }

  if (CONFIG_AUTH_TOKEN === 'change-me-in-production') {
    logger.warn('CONFIG_AUTH_TOKEN not set! Using default token. This is insecure!');
  }

  return token === CONFIG_AUTH_TOKEN;
}

/**
 * Read current .env file
 */
export async function readEnvFile(): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(ENV_FILE_PATH, 'utf-8');
    const env: Record<string, string> = {};

    // Parse .env file
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') {
        continue;
      }

      // Parse key=value
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        env[key] = value;
      }
    }

    return env;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn('.env file not found, returning empty config');
      return {};
    }
    throw error;
  }
}

/**
 * Write .env file with updated values
 */
export async function writeEnvFile(envVars: Record<string, string>): Promise<void> {
  // Build .env file content
  const lines: string[] = [
    '# proPACE Environment Configuration',
    '# Updated via Config API',
    `# Last Modified: ${new Date().toISOString()}`,
    ''
  ];

  // Add environment variables
  for (const [key, value] of Object.entries(envVars)) {
    // Escape values with special characters
    const needsQuotes = /[\s#]/.test(value);
    const formattedValue = needsQuotes ? `"${value}"` : value;
    lines.push(`${key}=${formattedValue}`);
  }

  lines.push(''); // Trailing newline

  const content = lines.join('\n');

  // Backup existing .env
  try {
    const backupPath = `${ENV_FILE_PATH}.backup`;
    await fs.copyFile(ENV_FILE_PATH, backupPath);
    logger.info('Created .env backup', { backupPath });
  } catch (error) {
    // Ignore if file doesn't exist
  }

  // Write new .env
  await fs.writeFile(ENV_FILE_PATH, content, 'utf-8');
  logger.info('.env file updated successfully');
}

/**
 * Get current environment configuration
 */
export async function getConfig(authToken: string): Promise<{
  success: boolean;
  config?: Record<string, string>;
  error?: string;
}> {
  try {
    // Validate authentication
    if (!validateAuthToken(authToken)) {
      return {
        success: false,
        error: 'Invalid authentication token'
      };
    }

    const env = await readEnvFile();

    // Mask sensitive values
    const maskedEnv: Record<string, string> = {};
    const sensitiveKeys = ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIAL'];

    for (const [key, value] of Object.entries(env)) {
      const isSensitive = sensitiveKeys.some(sk => key.toUpperCase().includes(sk));
      if (isSensitive && value) {
        // Show first 4 and last 4 characters
        if (value.length > 8) {
          maskedEnv[key] = `${value.slice(0, 4)}...${value.slice(-4)}`;
        } else {
          maskedEnv[key] = '***';
        }
      } else {
        maskedEnv[key] = value;
      }
    }

    return {
      success: true,
      config: maskedEnv
    };
  } catch (error: any) {
    logger.error('Failed to get config', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update environment configuration
 */
export async function updateConfig(
  authToken: string,
  updates: Record<string, string>
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  requiresRestart?: boolean;
}> {
  try {
    // Validate authentication
    if (!validateAuthToken(authToken)) {
      return {
        success: false,
        error: 'Invalid authentication token'
      };
    }

    // Validate updates
    if (!updates || typeof updates !== 'object') {
      return {
        success: false,
        error: 'Invalid updates format'
      };
    }

    // Read current config
    const currentEnv = await readEnvFile();

    // Apply updates
    const updatedEnv = { ...currentEnv, ...updates };

    // Write updated config
    await writeEnvFile(updatedEnv);

    logger.info('Environment configuration updated', {
      updatedKeys: Object.keys(updates)
    });

    return {
      success: true,
      message: `Updated ${Object.keys(updates).length} environment variable(s)`,
      requiresRestart: true
    };
  } catch (error: any) {
    logger.error('Failed to update config', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete environment variables
 */
export async function deleteConfigKeys(
  authToken: string,
  keys: string[]
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  requiresRestart?: boolean;
}> {
  try {
    // Validate authentication
    if (!validateAuthToken(authToken)) {
      return {
        success: false,
        error: 'Invalid authentication token'
      };
    }

    // Read current config
    const currentEnv = await readEnvFile();

    // Remove keys
    for (const key of keys) {
      delete currentEnv[key];
    }

    // Write updated config
    await writeEnvFile(currentEnv);

    logger.info('Environment variables deleted', { deletedKeys: keys });

    return {
      success: true,
      message: `Deleted ${keys.length} environment variable(s)`,
      requiresRestart: true
    };
  } catch (error: any) {
    logger.error('Failed to delete config keys', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}
