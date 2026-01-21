/**
 * CLI-specific type definitions
 */

export interface CLIConfig {
  host: string;
  port: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
  weatherRefreshInterval: number;
  newsRefreshInterval: number;
  timeRefreshInterval: number;
}

export interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  attemptCount: number;
}

export interface DisplayData {
  time: TimeData;
  weather: WeatherData | null;
  news: NewsData | null;
  conversation: ConversationData;
  connectionState: ConnectionState;
}

export interface TimeData {
  time: string;
  date: string;
}

export interface WeatherData {
  city: string;
  temp: number;
  description: string;
  feelsLike: number;
  lastUpdated: Date;
}

export interface NewsData {
  headlines: string[];
  lastUpdated: Date;
}

export interface ConversationData {
  query: string;
  response: string;
}

export interface PanelDimensions {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface LayoutConfig {
  header: PanelDimensions;
  time: PanelDimensions;
  weather: PanelDimensions;
  news: PanelDimensions;
  conversation: PanelDimensions;
  input: PanelDimensions;
}
