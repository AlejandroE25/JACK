import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

class Logger {
  private minLevel: number;
  private logFile: string;

  constructor() {
    this.minLevel = LOG_LEVELS[config.logLevel as LogLevel] || LOG_LEVELS.info;
    this.logFile = config.logFile;
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const dir = dirname(this.logFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return COLORS.dim;
      case 'info':
        return COLORS.cyan;
      case 'warn':
        return COLORS.yellow;
      case 'error':
        return COLORS.red;
      default:
        return COLORS.reset;
    }
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message);
    const color = this.getColor(level);

    // Console output with colors
    console.log(`${color}${formattedMessage}${COLORS.reset}`, ...args);

    // File output without colors
    try {
      appendFileSync(this.logFile, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }
}

export const logger = new Logger();
