import { WebSocket } from 'ws';

/**
 * Core message structure matching original Python format: "query$$response"
 */
export interface PACEMessage {
  query: string;
  response: string;
}

/**
 * Extended WebSocket with client metadata
 */
export interface PACEClient extends WebSocket {
  id: string;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * Memory entry in SQLite database
 */
export interface Memory {
  id?: number;
  timestamp: string;
  topic: string;
  content: string;
  importance: number; // 1-10
  metadata?: Record<string, any>;
  tags?: string;
}

/**
 * Conversation message for Claude context
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

/**
 * Subsystem check result
 */
export interface SubsystemStatus {
  name: string;
  isWorking: boolean;
  error?: string;
}

/**
 * Weather response
 */
export interface WeatherData {
  city: string;
  weather: string;
  temp: number;
  feelsLike: number;
}

/**
 * News item
 */
export interface NewsItem {
  title: string;
  link?: string;
  published?: string;
}

/**
 * Configuration interface
 */
export interface PACEConfig {
  port: number;
  host: string;
  nodeEnv: string;
  anthropicApiKey: string;
  openaiApiKey?: string;
  openWeatherMapApiKey: string;
  wolframAlphaAppId: string;
  databasePath: string;
  maxConversationHistory: number;
  memorySearchLimit: number;
  weatherCacheTTL: number;
  newsCacheTTL: number;
  responseCacheTTL: number;
  logLevel: string;
  logFile: string;
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}
