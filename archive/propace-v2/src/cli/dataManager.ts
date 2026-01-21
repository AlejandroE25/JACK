import { EventEmitter } from 'events';
import { TimeData, WeatherData, NewsData, ConversationData } from './types.js';
import { PACEClient } from './client.js';

/**
 * Time Manager
 * Updates local time every second
 */
export class TimeManager extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private updateInterval: number;

  constructor(updateInterval: number = 1000) {
    super();
    this.updateInterval = updateInterval;
  }

  start(): void {
    this.update();
    this.interval = setInterval(() => this.update(), this.updateInterval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private update(): void {
    const now = new Date();
    const timeData: TimeData = {
      time: now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }),
      date: now.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    };
    this.emit('update', timeData);
  }
}

/**
 * Weather Manager
 * Fetches weather from server and auto-refreshes
 */
export class WeatherManager extends EventEmitter {
  private client: PACEClient;
  private interval: NodeJS.Timeout | null = null;
  private refreshInterval: number;
  private weatherData: WeatherData | null = null;
  private loading: boolean = false;

  constructor(client: PACEClient, refreshInterval: number) {
    super();
    this.client = client;
    this.refreshInterval = refreshInterval;
  }

  start(): void {
    this.fetch();
    this.interval = setInterval(() => this.fetch(), this.refreshInterval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async fetch(): Promise<void> {
    if (this.loading || !this.client.isConnected()) return;

    this.loading = true;
    this.emit('loading');

    // Send weather query to server
    const messageHandler = (data: { query: string; response: string }) => {
      // Check if this is the weather response
      const queryLower = data.query.toLowerCase();
      if (queryLower.includes('weather') || queryLower.includes('temperature')) {
        this.parseWeatherResponse(data.response);
        this.client.removeListener('message', messageHandler);
        this.loading = false;
      }
    };

    this.client.on('message', messageHandler);

    // Give a small delay to ensure handler is registered
    setTimeout(() => {
      if (this.client.isConnected()) {
        this.client.send("What's the weather?");
      } else {
        this.loading = false;
      }
    }, 50);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (this.loading) {
        this.client.removeListener('message', messageHandler);
        this.loading = false;
        this.emit('error', new Error('Weather request timed out'));
      }
    }, 10000);
  }

  private parseWeatherResponse(response: string): void {
    // Parse response like "It's 72°F and sunny in Boston. Feels like 70°F."
    // Also handle variations like "It's sunny and 72°F in Boston, MA. Feels like 70°F."

    const tempMatch = response.match(/(\d+)°F/);
    const feelsLikeMatch = response.match(/Feels like (\d+)°F/i);

    // Try different city patterns
    let cityMatch = response.match(/in ([^.,]+)/i);
    if (!cityMatch) {
      cityMatch = response.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*[A-Z]{2}/);
    }

    // Try different description patterns
    let descMatch = response.match(/and\s+(\w+)/i);
    if (!descMatch) {
      descMatch = response.match(/It's\s+(\w+)/i);
    }
    if (!descMatch) {
      descMatch = response.match(/(\w+)\s+and\s+\d+/i);
    }

    if (tempMatch) {
      this.weatherData = {
        city: cityMatch ? cityMatch[1].trim() : 'Unknown',
        temp: parseInt(tempMatch[1], 10),
        description: descMatch ? descMatch[1] : 'Unknown',
        feelsLike: feelsLikeMatch ? parseInt(feelsLikeMatch[1], 10) : parseInt(tempMatch[1], 10),
        lastUpdated: new Date(),
      };
      this.emit('update', this.weatherData);
    } else {
      // Could not parse temperature, but maybe we have city
      // Just display the raw response
      this.weatherData = {
        city: cityMatch ? cityMatch[1].trim() : 'Unknown',
        temp: 0,
        description: response.substring(0, 50), // Show first 50 chars
        feelsLike: 0,
        lastUpdated: new Date(),
      };
      this.emit('update', this.weatherData);
      this.emit('error', new Error(`Partial weather parse: ${response}`));
    }
  }

  getData(): WeatherData | null {
    return this.weatherData;
  }
}

/**
 * News Manager
 * Fetches news from server and auto-refreshes
 */
export class NewsManager extends EventEmitter {
  private client: PACEClient;
  private interval: NodeJS.Timeout | null = null;
  private refreshInterval: number;
  private newsData: NewsData | null = null;
  private loading: boolean = false;
  private currentIndex: number = 0;

  constructor(client: PACEClient, refreshInterval: number) {
    super();
    this.client = client;
    this.refreshInterval = refreshInterval;
  }

  start(): void {
    this.fetch();
    this.interval = setInterval(() => this.fetch(), this.refreshInterval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async fetch(): Promise<void> {
    if (this.loading || !this.client.isConnected()) return;

    this.loading = true;
    this.emit('loading');

    // Send news query to server
    const messageHandler = (data: { query: string; response: string }) => {
      // Check if this is the news response
      const queryLower = data.query.toLowerCase();
      if (queryLower.includes('news') || queryLower.includes('headlines')) {
        this.parseNewsResponse(data.response);
        this.client.removeListener('message', messageHandler);
        this.loading = false;
      }
    };

    this.client.on('message', messageHandler);

    // Give a small delay to ensure handler is registered
    setTimeout(() => {
      if (this.client.isConnected()) {
        this.client.send("What's the news?");
      } else {
        this.loading = false;
      }
    }, 100); // Slightly longer delay to avoid collision with weather

    // Timeout after 10 seconds
    setTimeout(() => {
      if (this.loading) {
        this.client.removeListener('message', messageHandler);
        this.loading = false;
        this.emit('error', new Error('News request timed out'));
      }
    }, 10000);
  }

  private parseNewsResponse(response: string): void {
    // Parse response like "Here are the latest headlines: Headline 1. Headline 2. Headline 3."
    const headlinesMatch = response.match(/latest headlines: (.+)/i);

    if (headlinesMatch) {
      const headlinesText = headlinesMatch[1];
      // Split by periods, but keep sentences together
      const headlines = headlinesText
        .split('. ')
        .map((h) => h.trim())
        .filter((h) => h.length > 0)
        .slice(0, 5); // Limit to 5 headlines

      this.newsData = {
        headlines,
        lastUpdated: new Date(),
      };
      this.emit('update', this.newsData);
    } else {
      // Could not parse, emit raw response
      this.emit('error', new Error(`Could not parse news: ${response}`));
    }
  }

  getData(): NewsData | null {
    return this.newsData;
  }

  /**
   * Navigate to next headline
   */
  nextHeadline(): void {
    if (this.newsData && this.newsData.headlines.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % this.newsData.headlines.length;
      this.emit('update', this.newsData);
    }
  }

  /**
   * Navigate to previous headline
   */
  previousHeadline(): void {
    if (this.newsData && this.newsData.headlines.length > 0) {
      this.currentIndex =
        (this.currentIndex - 1 + this.newsData.headlines.length) % this.newsData.headlines.length;
      this.emit('update', this.newsData);
    }
  }

  /**
   * Get current headline index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get total number of headlines
   */
  getHeadlineCount(): number {
    return this.newsData ? this.newsData.headlines.length : 0;
  }
}

/**
 * Conversation Manager
 * Tracks current conversation exchange
 */
export class ConversationManager extends EventEmitter {
  private conversationData: ConversationData = {
    query: '',
    response: '',
  };
  private pendingQuery: string = '';

  setQuery(query: string): void {
    this.pendingQuery = query;
    this.conversationData.query = query;
    this.conversationData.response = ''; // Clear previous response while waiting
    this.emit('update', this.conversationData);
  }

  setResponse(response: string): void {
    // Keep the query that triggered this response
    if (this.pendingQuery) {
      this.conversationData.query = this.pendingQuery;
    }
    this.conversationData.response = response;
    this.emit('update', this.conversationData);
  }

  clear(): void {
    this.conversationData = {
      query: '',
      response: '',
    };
    this.pendingQuery = '';
    this.emit('update', this.conversationData);
  }

  getData(): ConversationData {
    return { ...this.conversationData };
  }
}
