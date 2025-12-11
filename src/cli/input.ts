import * as readline from 'readline';
import { EventEmitter } from 'events';

/**
 * Input Handler
 * Handles user input from the terminal using readline
 */
export class InputHandler extends EventEmitter {
  private rl: readline.Interface | null = null;
  private inputEnabled: boolean = false;

  constructor() {
    super();
  }

  /**
   * Initialize readline interface
   */
  init(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Hide readline's default prompt
    this.rl.setPrompt('');

    // Handle line input
    this.rl.on('line', (input: string) => {
      this.handleInput(input.trim());
    });

    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      this.emit('exit');
    });

    // Handle Ctrl+D (EOF)
    this.rl.on('close', () => {
      this.emit('exit');
    });

    // Enable raw mode for arrow keys
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.on('data', (key: Buffer) => {
        this.handleRawInput(key);
      });
    }

    this.inputEnabled = true;
  }

  /**
   * Handle raw input for special keys like arrows
   */
  private handleRawInput(key: Buffer): void {
    const keyStr = key.toString();

    // Arrow keys send escape sequences
    if (keyStr === '\x1b[C') {
      // Right arrow
      this.emit('nextHeadline');
    } else if (keyStr === '\x1b[D') {
      // Left arrow
      this.emit('previousHeadline');
    }
  }

  /**
   * Handle user input
   */
  private handleInput(input: string): void {
    if (!input) {
      this.emit('prompt');
      return;
    }

    // Check for special commands
    if (input.startsWith('/')) {
      this.handleCommand(input);
    } else {
      // Regular message
      this.emit('message', input);
    }

    // Re-prompt
    this.emit('prompt');
  }

  /**
   * Handle special commands
   */
  private handleCommand(command: string): void {
    const cmd = command.toLowerCase();

    switch (cmd) {
      case '/quit':
      case '/exit':
        this.emit('exit');
        break;

      // case '/restart':
      //   this.emit('restart');
      //   break;

      case '/clear':
        this.emit('clear');
        break;

      case '/refresh':
        this.emit('refresh');
        break;

      case '/help':
        this.emit('help');
        break;

      default:
        this.emit('error', new Error(`Unknown command: ${command}`));
        break;
    }
  }

  /**
   * Enable input
   */
  enable(): void {
    if (this.rl) {
      this.inputEnabled = true;
      this.rl.prompt();
    }
  }

  /**
   * Disable input
   */
  disable(): void {
    this.inputEnabled = false;
  }

  /**
   * Prompt for input
   */
  prompt(): void {
    if (this.rl && this.inputEnabled) {
      this.rl.prompt();
    }
  }

  /**
   * Close the input handler
   */
  close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.inputEnabled = false;
  }

  /**
   * Write to output (for displaying text without interfering with input)
   */
  write(text: string): void {
    if (this.rl) {
      // Clear current line, write text, then re-prompt
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(text + '\n');
      this.rl.prompt(true);
    }
  }
}
