import chalk from 'chalk';
import boxen from 'boxen';
import { DisplayData, LayoutConfig } from './types.js';

/**
 * Terminal UI Renderer
 * Handles full-screen dashboard rendering with panels
 */
export class TerminalUI {
  private displayData: DisplayData;
  private layout: LayoutConfig;
  private terminalWidth: number;
  private terminalHeight: number;

  constructor() {
    this.displayData = this.getDefaultDisplayData();
    this.terminalWidth = process.stdout.columns || 80;
    this.terminalHeight = process.stdout.rows || 24;
    this.layout = this.calculateLayout();

    // Listen for terminal resize
    process.stdout.on('resize', () => {
      this.terminalWidth = process.stdout.columns || 80;
      this.terminalHeight = process.stdout.rows || 24;
      this.layout = this.calculateLayout();
      this.render();
    });
  }

  /**
   * Get default display data
   */
  private getDefaultDisplayData(): DisplayData {
    return {
      time: {
        time: '--:--:--',
        date: '---',
      },
      weather: null,
      news: null,
      conversation: {
        query: '',
        response: '',
      },
      connectionState: {
        connected: false,
        reconnecting: false,
        attemptCount: 0,
      },
    };
  }

  /**
   * Calculate panel layout based on terminal size
   * New design: Chat on left, Weather/News stacked on right
   */
  private calculateLayout(): LayoutConfig {
    const width = this.terminalWidth;
    const height = this.terminalHeight;

    // Panel heights
    const headerHeight = 8; // ASCII art logo
    const inputHeight = 3;
    const contentHeight = height - headerHeight - inputHeight;

    // Panel widths - split 50/50
    const leftWidth = Math.floor(width / 2);
    const rightWidth = width - leftWidth;

    // Right side split - weather and news
    const weatherHeight = Math.floor(contentHeight * 0.3); // 30% for weather
    const newsHeight = contentHeight - weatherHeight; // 70% for news

    return {
      header: {
        width: width,
        height: headerHeight,
        x: 0,
        y: 0,
      },
      time: {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      }, // Time not shown separately, will be in header
      weather: {
        width: rightWidth,
        height: weatherHeight,
        x: leftWidth,
        y: headerHeight,
      },
      news: {
        width: rightWidth,
        height: newsHeight,
        x: leftWidth,
        y: headerHeight + weatherHeight,
      },
      conversation: {
        width: leftWidth,
        height: contentHeight,
        x: 0,
        y: headerHeight,
      },
      input: {
        width: width,
        height: inputHeight,
        x: 0,
        y: height - inputHeight,
      },
    };
  }

  /**
   * Update display data
   */
  updateData(data: Partial<DisplayData>): void {
    this.displayData = {
      ...this.displayData,
      ...data,
    };
  }

  /**
   * Clear screen and move cursor to top
   */
  private clearScreen(): void {
    // ANSI escape codes
    process.stdout.write('\x1b[2J'); // Clear screen
    process.stdout.write('\x1b[H'); // Move cursor to home
  }

  /**
   * Move cursor to position
   */
  private moveCursor(x: number, y: number): void {
    process.stdout.write(`\x1b[${y + 1};${x + 1}H`);
  }

  /**
   * Render the full UI
   */
  render(newsIndex: number = 0, newsCount: number = 0): void {
    this.clearScreen();

    this.renderHeader();
    this.renderConversation();
    this.renderWeather();
    this.renderNews(newsIndex, newsCount);
    this.renderInput();
  }

  /**
   * Render header panel
   */
  private renderHeader(): void {
    const { connectionState, time } = this.displayData;
    const statusIcon = connectionState.connected
      ? chalk.green('●')
      : connectionState.reconnecting
        ? chalk.yellow('●')
        : chalk.red('●');

    const statusText = connectionState.connected
      ? 'Connected'
      : connectionState.reconnecting
        ? `Reconnecting (${connectionState.attemptCount})`
        : 'Disconnected';

    // ASCII art logo - "PACE" with italic formatting
    const italic = '\x1b[3m';
    const reset = '\x1b[0m';
    const logo = chalk.bold.cyan(italic + '██████╗  █████╗  ██████╗███████╗' + reset);
    const logo2 = chalk.bold.cyan(italic + '██╔══██╗██╔══██╗██╔════╝██╔════╝' + reset);
    const logo3 = chalk.bold.cyan(italic + '██████╔╝███████║██║     █████╗  ' + reset);
    const logo4 = chalk.bold.cyan(italic + '██╔═══╝ ██╔══██║██║     ██╔══╝  ' + reset);
    const logo5 = chalk.bold.cyan(italic + '██║     ██║  ██║╚██████╗███████╗' + reset);
    const logo6 = chalk.bold.cyan(italic + '╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝' + reset);

    const timeDisplay = chalk.white(time.time) + ' ' + chalk.gray(time.date);
    const status = `${statusIcon} ${statusText}`;

    const headerLine1 = this.padLine(logo, timeDisplay, this.layout.header.width - 4);
    const headerLine2 = this.padLine(logo2, '', this.layout.header.width - 4);
    const headerLine3 = this.padLine(logo3, status, this.layout.header.width - 4);
    const headerLine4 = this.padLine(logo4, '', this.layout.header.width - 4);
    const headerLine5 = this.padLine(logo5, '', this.layout.header.width - 4);
    const headerLine6 = this.padLine(logo6, chalk.gray('v2.0'), this.layout.header.width - 4);

    const headerText = `${headerLine1}\n${headerLine2}\n${headerLine3}\n${headerLine4}\n${headerLine5}\n${headerLine6}`;

    const box = boxen(headerText, {
      padding: 0,
      margin: 0,
      borderStyle: 'round',
      borderColor: 'cyan',
      width: this.layout.header.width,
    });

    this.moveCursor(0, this.layout.header.y);
    process.stdout.write(box);
  }

  /**
   * Render weather panel
   */
  private renderWeather(): void {
    const { weather } = this.displayData;

    let content: string;
    if (weather) {
      const lastUpdated = weather.lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      content = `${chalk.bold('☁️  WEATHER')}\n\n${chalk.white.bold(weather.city)}\n${chalk.yellow(`${weather.temp}°F`)} • ${weather.description}\nFeels like ${weather.feelsLike}°F\n\n${chalk.gray(`Updated: ${lastUpdated}`)}`;
    } else {
      content = `${chalk.bold('☁️  WEATHER')}\n\n${chalk.gray('Loading...')}`;
    }

    const box = boxen(content, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: 'round',
      borderColor: 'yellow',
      width: this.layout.weather.width,
      height: this.layout.weather.height,
    });

    this.moveCursor(this.layout.weather.x, this.layout.weather.y);
    this.writeMultiline(box, this.layout.weather.y, this.layout.weather.x);
  }

  /**
   * Render news panel
   */
  renderNews(currentIndex: number = 0, totalCount: number = 0): void {
    const { news } = this.displayData;

    let content: string;
    if (news && news.headlines.length > 0) {
      const lastUpdated = news.lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Calculate how many headlines can fit in the panel
      const maxWidth = this.layout.news.width - 6;
      const availableHeight = this.layout.news.height - 6; // Account for borders, title, footer

      // Show as many headlines as will fit
      const headlinesToShow = Math.min(news.headlines.length, Math.floor(availableHeight / 2));

      const headlinesList = news.headlines
        .slice(0, headlinesToShow)
        .map((headline, index) => {
          const truncated = headline.length > maxWidth - 3
            ? headline.substring(0, maxWidth - 6) + '...'
            : headline;
          return `${chalk.gray('•')} ${chalk.white(truncated)}`;
        })
        .join('\n');

      content = `${chalk.bold('📰 NEWS HEADLINES')}\n\n${headlinesList}\n\n${chalk.gray(`Updated: ${lastUpdated}`)}`;
    } else {
      content = `${chalk.bold('📰 NEWS HEADLINES')}\n\n${chalk.gray('Loading...')}`;
    }

    const box = boxen(content, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: 'round',
      borderColor: 'magenta',
      width: this.layout.news.width,
      height: this.layout.news.height,
    });

    this.moveCursor(this.layout.news.x, this.layout.news.y);
    this.writeMultiline(box, this.layout.news.y, this.layout.news.x);
  }

  /**
   * Render conversation panel
   */
  private renderConversation(): void {
    const { conversation } = this.displayData;

    let content: string;
    if (conversation.query && conversation.response) {
      const maxWidth = this.layout.conversation.width - 6;
      const query = this.wrapText(conversation.query, maxWidth);
      const response = this.wrapText(conversation.response, maxWidth);
      content = `${chalk.bold('💬 CHAT')}\n\n${chalk.cyan.bold('You:')}\n${chalk.white(query)}\n\n${chalk.green.bold('PACE:')}\n${chalk.white(response)}`;
    } else if (conversation.query) {
      const maxWidth = this.layout.conversation.width - 6;
      const query = this.wrapText(conversation.query, maxWidth);
      content = `${chalk.bold('💬 CHAT')}\n\n${chalk.cyan.bold('You:')}\n${chalk.white(query)}\n\n${chalk.green.bold('PACE:')}\n${chalk.gray('Thinking...')}`;
    } else {
      content = `${chalk.bold('💬 CHAT')}\n\n${chalk.gray('Type a message below and press Enter to chat...')}`;
    }

    const box = boxen(content, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: 'round',
      borderColor: 'green',
      width: this.layout.conversation.width,
      height: this.layout.conversation.height,
    });

    this.moveCursor(this.layout.conversation.x, this.layout.conversation.y);
    this.writeMultiline(box, this.layout.conversation.y, this.layout.conversation.x);
  }

  /**
   * Render input panel
   */
  private renderInput(): void {
    const content = chalk.bold.white('> ');

    const box = boxen(content, {
      padding: 0,
      margin: 0,
      borderStyle: 'round',
      borderColor: 'white',
      width: this.layout.input.width,
    });

    this.moveCursor(this.layout.input.x, this.layout.input.y);
    this.writeMultiline(box, this.layout.input.y);

    // Position cursor in input area
    this.moveCursor(4, this.layout.input.y + 1);
  }

  /**
   * Helper: Pad a line with text on left and right
   */
  private padLine(left: string, right: string, width: number): string {
    const leftStripped = this.stripAnsi(left);
    const rightStripped = this.stripAnsi(right);
    const padding = width - leftStripped.length - rightStripped.length;
    return left + ' '.repeat(Math.max(0, padding)) + right;
  }

  /**
   * Helper: Strip ANSI codes for length calculation
   */
  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Helper: Wrap text to max width
   */
  private wrapText(text: string, maxWidth: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);

    return lines.join('\n');
  }

  /**
   * Helper: Write multiline text starting at X,Y position
   */
  private writeMultiline(text: string, startY: number, startX: number = 0): void {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      this.moveCursor(startX, startY + index);
      process.stdout.write(line);
    });
  }

  /**
   * Get input position for readline
   */
  getInputPosition(): { x: number; y: number } {
    return {
      x: 4,
      y: this.layout.input.y + 1,
    };
  }
}
