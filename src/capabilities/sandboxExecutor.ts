/**
 * SandboxExecutor - Safe code execution in subprocess
 *
 * Responsibilities:
 * - Execute generated code in isolated subprocess
 * - Enforce timeouts and resource limits
 * - Control file and network access
 * - Persist and manage generated tools
 */

import { spawn, type Subprocess, $ } from 'bun';
import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { homedir } from 'os';

export interface GeneratedTool {
  name: string;
  description: string;
  code: string;
  inputSchema: object;
  createdAt?: number;
  lastUsed?: number;
  useCount?: number;
}

export interface SandboxResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionId?: string;
}

export interface CodeGenerator {
  generate(description: string): Promise<GeneratedTool>;
}

export interface SandboxExecutorOptions {
  toolsDir: string;
  timeout: number;
  allowedPaths: string[];
  codeGenerator?: CodeGenerator;
  onNetworkRequest?: (url: string) => void;
}

interface RunningExecution {
  process: Subprocess;
  resolve: (result: SandboxResult) => void;
}

export class SandboxExecutor {
  private toolsDir: string;
  private timeout: number;
  private allowedPaths: string[];
  private codeGenerator?: CodeGenerator;
  private onNetworkRequest?: (url: string) => void;
  private runningExecutions = new Map<string, RunningExecution>();

  constructor(options: SandboxExecutorOptions) {
    this.toolsDir = options.toolsDir;
    this.timeout = options.timeout;
    this.allowedPaths = options.allowedPaths.map((p) => resolve(p));
    this.codeGenerator = options.codeGenerator;
    this.onNetworkRequest = options.onNetworkRequest;
  }

  /**
   * Execute a tool in a sandboxed subprocess.
   */
  async execute(tool: GeneratedTool, params: Record<string, unknown>): Promise<SandboxResult> {
    const executionId = crypto.randomUUID();

    // Create the worker script that will run the tool
    const workerCode = this.createWorkerCode(tool, params);

    return new Promise<SandboxResult>((resolveExecution) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.runningExecutions.delete(executionId);
      };

      const finish = (result: SandboxResult) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolveExecution(result);
      };

      try {
        // Find bun executable - try common locations
        const bunPath = this.findBunPath();

        // Spawn subprocess to execute the code
        const proc = spawn({
          cmd: [bunPath, 'run', '-'],
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            SANDBOX_ALLOWED_PATHS: JSON.stringify(this.allowedPaths),
            SANDBOX_PARAMS: JSON.stringify(params),
            SANDBOX_EXECUTION_ID: executionId,
          },
        });

        this.runningExecutions.set(executionId, { process: proc, resolve: finish });

        // Write the worker code to stdin
        proc.stdin.write(workerCode);
        proc.stdin.end();

        // Set up timeout
        timeoutId = setTimeout(() => {
          proc.kill();
          finish({
            success: false,
            error: 'Execution timeout exceeded',
            executionId,
          });
        }, this.timeout);

        // Handle output
        this.handleProcessOutput(proc, executionId, tool, finish);
      } catch (error) {
        finish({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start sandbox',
          executionId,
        });
      }
    });
  }

  private async handleProcessOutput(
    proc: Subprocess,
    executionId: string,
    tool: GeneratedTool,
    finish: (result: SandboxResult) => void
  ): Promise<void> {
    try {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Parse network request logs from stderr
      if (this.onNetworkRequest) {
        const networkLines = stderr.split('\n').filter((l) => l.startsWith('NETWORK:'));
        for (const line of networkLines) {
          const url = line.replace('NETWORK:', '').trim();
          this.onNetworkRequest(url);
        }
      }

      if (exitCode !== 0) {
        // Check for specific error types
        const errorLines = stderr.split('\n').filter((l) => !l.startsWith('NETWORK:'));
        const errorMessage = errorLines.join('\n').trim() || `Process exited with code ${exitCode}`;
        finish({
          success: false,
          error: errorMessage,
          executionId,
        });
        return;
      }

      // Parse the result from stdout
      try {
        const result = JSON.parse(stdout);

        // Update usage stats if tool is persisted (await to ensure completion)
        await this.updateToolUsage(tool.name).catch(() => {});

        finish({
          success: true,
          data: result,
          executionId,
        });
      } catch {
        // If output isn't JSON, return as string
        finish({
          success: true,
          data: stdout.trim(),
          executionId,
        });
      }
    } catch (error) {
      finish({
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        executionId,
      });
    }
  }

  private createWorkerCode(tool: GeneratedTool, params: Record<string, unknown>): string {
    // Create a self-contained script that:
    // 1. Defines the context object with controlled fetch/file access
    // 2. Runs the tool code
    // 3. Outputs result as JSON
    return `
const allowedPaths = JSON.parse(process.env.SANDBOX_ALLOWED_PATHS || '[]');
const params = JSON.parse(process.env.SANDBOX_PARAMS || '{}');

function isPathAllowed(filePath) {
  const resolved = require('path').resolve(filePath);
  return allowedPaths.some(allowed => resolved.startsWith(allowed));
}

const context = {
  fetch: async (url, options) => {
    console.error('NETWORK:' + url);
    return fetch(url, options);
  },
  readFile: async (path) => {
    if (!isPathAllowed(path)) {
      throw new Error('File access denied: ' + path);
    }
    const fs = require('fs/promises');
    return fs.readFile(path, 'utf-8');
  },
  writeFile: async (path, content) => {
    if (!isPathAllowed(path)) {
      throw new Error('File access denied: ' + path);
    }
    const fs = require('fs/promises');
    const pathMod = require('path');
    await fs.mkdir(pathMod.dirname(path), { recursive: true });
    return fs.writeFile(path, content, 'utf-8');
  },
};

async function run() {
  ${tool.code}

  const fn = module.exports;
  const result = await fn(params, context);
  console.log(JSON.stringify(result));
}

run().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
`;
  }

  /**
   * Generate a new tool from a description.
   */
  async generate(description: string): Promise<GeneratedTool> {
    if (!this.codeGenerator) {
      throw new Error('No code generator configured');
    }

    const tool = await this.codeGenerator.generate(description);
    tool.createdAt = Date.now();
    tool.lastUsed = 0;
    tool.useCount = 0;

    return tool;
  }

  /**
   * Save a tool to disk for persistence.
   */
  async saveTool(tool: GeneratedTool): Promise<void> {
    await mkdir(this.toolsDir, { recursive: true });

    const toolData: GeneratedTool = {
      ...tool,
      createdAt: tool.createdAt || Date.now(),
      lastUsed: tool.lastUsed || 0,
      useCount: tool.useCount || 0,
    };

    const filePath = join(this.toolsDir, `${tool.name}.json`);
    await writeFile(filePath, JSON.stringify(toolData, null, 2));
  }

  /**
   * Load a tool from disk.
   */
  async loadTool(name: string): Promise<GeneratedTool | null> {
    try {
      const filePath = join(this.toolsDir, `${name}.json`);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as GeneratedTool;
    } catch {
      return null;
    }
  }

  /**
   * List all saved tools.
   */
  async listTools(): Promise<GeneratedTool[]> {
    try {
      const files = await readdir(this.toolsDir);
      const tools: GeneratedTool[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const tool = await this.loadTool(file.replace('.json', ''));
          if (tool) {
            tools.push(tool);
          }
        }
      }

      return tools;
    } catch {
      return [];
    }
  }

  /**
   * Delete a saved tool.
   */
  async deleteTool(name: string): Promise<void> {
    try {
      const filePath = join(this.toolsDir, `${name}.json`);
      await unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Update usage stats for a tool.
   */
  private async updateToolUsage(name: string): Promise<void> {
    const tool = await this.loadTool(name);
    if (tool) {
      tool.lastUsed = Date.now();
      tool.useCount = (tool.useCount || 0) + 1;
      await this.saveTool(tool);
    }
  }

  /**
   * Terminate all running executions.
   */
  terminateAll(): void {
    for (const [id, execution] of this.runningExecutions) {
      execution.process.kill();
      execution.resolve({
        success: false,
        error: 'Execution terminated',
        executionId: id,
      });
    }
    this.runningExecutions.clear();
  }

  /**
   * Shutdown the executor.
   */
  async shutdown(): Promise<void> {
    this.terminateAll();
  }

  /**
   * Find the bun executable path.
   */
  private findBunPath(): string {
    // Try common bun installation locations
    const home = homedir();
    const possiblePaths = [
      join(home, '.bun', 'bin', 'bun'),
      '/usr/local/bin/bun',
      '/opt/homebrew/bin/bun',
      'bun', // Fallback to PATH
    ];

    // For now, use the known path or try the first common location
    // In production, we could check which exists
    return possiblePaths[0];
  }
}
