import dotenv from 'dotenv';
import { PACEConfig } from '../types/index.js';

// Load environment variables
dotenv.config();

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): PACEConfig {
  const config: PACEConfig = {
    port: parseInt(process.env.PORT || '9001', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY,
    openWeatherMapApiKey: process.env.OPENWEATHERMAP_API_KEY || '',
    wolframAlphaAppId: process.env.WOLFRAM_ALPHA_APP_ID || '',
    databasePath: process.env.DATABASE_PATH || './data/memories.db',
    maxConversationHistory: parseInt(process.env.MAX_CONVERSATION_HISTORY || '10', 10),
    memorySearchLimit: parseInt(process.env.MEMORY_SEARCH_LIMIT || '5', 10),
    weatherCacheTTL: parseInt(process.env.WEATHER_CACHE_TTL || '900000', 10),
    newsCacheTTL: parseInt(process.env.NEWS_CACHE_TTL || '3600000', 10),
    responseCacheTTL: parseInt(process.env.RESPONSE_CACHE_TTL || '300000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || './logs/pace.log',
    routingCacheTTL: parseInt(process.env.ROUTING_CACHE_TTL || '300000', 10),
    routingConfidenceThreshold: parseFloat(
      process.env.ROUTING_CONFIDENCE_THRESHOLD || '0.8'
    ),
    routingModel: process.env.ROUTING_MODEL || 'claude-haiku-4-5-20251001',
    enableRoutingPrediction: process.env.ENABLE_ROUTING_PREDICTION !== 'false',
    enableSessionLearning: process.env.ENABLE_SESSION_LEARNING !== 'false',
  };

  // Validate required API keys
  if (!config.anthropicApiKey) {
    console.warn('⚠️  WARNING: ANTHROPIC_API_KEY not set. Claude AI will not work.');
  }

  return config;
}

export const config = loadConfig();
