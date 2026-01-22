import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  SandboxExecutor,
  type GeneratedTool,
  type SandboxResult,
  type CodeGenerator,
} from '../../../src/capabilities/sandboxExecutor';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SandboxExecutor', () => {
  let executor: SandboxExecutor;
  let testDir: string;
  let toolsDir: string;

  // Mock code generator
  const mockGenerator: CodeGenerator = {
    generate: mock(async (description: string) => ({
      name: 'test-tool',
      description,
      code: 'module.exports = async (params) => ({ result: params.input * 2 });',
      inputSchema: { type: 'object', properties: { input: { type: 'number' } } },
    })),
  };

  beforeEach(async () => {
    testDir = join(tmpdir(), `jack-sandbox-test-${Date.now()}`);
    toolsDir = join(testDir, 'tools');
    await mkdir(toolsDir, { recursive: true });

    executor = new SandboxExecutor({
      toolsDir,
      timeout: 5000,
      allowedPaths: [testDir],
    });
  });

  afterEach(async () => {
    await executor.shutdown();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('code execution', () => {
    test('executes simple code and returns result', async () => {
      const tool: GeneratedTool = {
        name: 'doubler',
        description: 'Doubles a number',
        code: 'module.exports = async (params) => ({ doubled: params.value * 2 });',
        inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
      };

      const result = await executor.execute(tool, { value: 21 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ doubled: 42 });
    });

    test('handles code that returns a string', async () => {
      const tool: GeneratedTool = {
        name: 'greeter',
        description: 'Greets someone',
        code: 'module.exports = async (params) => `Hello, ${params.name}!`;',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      };

      const result = await executor.execute(tool, { name: 'World' });

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello, World!');
    });

    test('handles synchronous code', async () => {
      const tool: GeneratedTool = {
        name: 'sync-tool',
        description: 'Sync operation',
        code: 'module.exports = (params) => params.a + params.b;',
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, { a: 5, b: 3 });

      expect(result.success).toBe(true);
      expect(result.data).toBe(8);
    });

    test('captures runtime errors', async () => {
      const tool: GeneratedTool = {
        name: 'error-tool',
        description: 'Throws an error',
        code: 'module.exports = async () => { throw new Error("Something went wrong"); };',
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Something went wrong');
    });

    test('captures syntax errors', async () => {
      const tool: GeneratedTool = {
        name: 'bad-syntax',
        description: 'Has syntax error',
        code: 'module.exports = async () => { return {{{{ };',
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('timeout handling', () => {
    test('terminates execution that exceeds timeout', async () => {
      const shortTimeoutExecutor = new SandboxExecutor({
        toolsDir,
        timeout: 500, // 500ms timeout
        allowedPaths: [testDir],
      });

      const tool: GeneratedTool = {
        name: 'slow-tool',
        description: 'Takes too long',
        code: `module.exports = async () => {
          await new Promise(r => setTimeout(r, 10000));
          return 'done';
        };`,
        inputSchema: { type: 'object' },
      };

      const result = await shortTimeoutExecutor.execute(tool, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');

      await shortTimeoutExecutor.shutdown();
    });

    test('completes fast execution within timeout', async () => {
      const tool: GeneratedTool = {
        name: 'fast-tool',
        description: 'Fast operation',
        code: 'module.exports = async () => "quick";',
        inputSchema: { type: 'object' },
      };

      const start = Date.now();
      const result = await executor.execute(tool, {});
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete well under timeout
    });
  });

  describe('file access', () => {
    test('allows reading files in allowed paths', async () => {
      const testFile = join(testDir, 'test-read.txt');
      await writeFile(testFile, 'Hello from file');

      const tool: GeneratedTool = {
        name: 'file-reader',
        description: 'Reads a file',
        code: `module.exports = async (params, context) => {
          const content = await context.readFile(params.path);
          return content;
        };`,
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      };

      const result = await executor.execute(tool, { path: testFile });

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello from file');
    });

    test('allows writing files in allowed paths', async () => {
      const testFile = join(testDir, 'test-write.txt');

      const tool: GeneratedTool = {
        name: 'file-writer',
        description: 'Writes a file',
        code: `module.exports = async (params, context) => {
          await context.writeFile(params.path, params.content);
          return 'written';
        };`,
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, {
        path: testFile,
        content: 'Written by sandbox',
      });

      expect(result.success).toBe(true);
      const content = await readFile(testFile, 'utf-8');
      expect(content).toBe('Written by sandbox');
    });

    test('denies access to paths outside allowed directories', async () => {
      const tool: GeneratedTool = {
        name: 'escape-attempt',
        description: 'Tries to escape',
        code: `module.exports = async (params, context) => {
          return await context.readFile('/etc/passwd');
        };`,
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied');
    });

    test('denies path traversal attempts', async () => {
      const tool: GeneratedTool = {
        name: 'traversal-attempt',
        description: 'Tries path traversal',
        code: `module.exports = async (params, context) => {
          return await context.readFile(params.path);
        };`,
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, {
        path: join(testDir, '..', '..', 'etc', 'passwd'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied');
    });
  });

  describe('network access', () => {
    test('allows fetch requests', async () => {
      const tool: GeneratedTool = {
        name: 'fetcher',
        description: 'Fetches a URL',
        code: `module.exports = async (params, context) => {
          const response = await context.fetch(params.url);
          return { status: response.status, ok: response.ok };
        };`,
        inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
      };

      // Using a reliable endpoint
      const result = await executor.execute(tool, {
        url: 'https://httpbin.org/get',
      });

      expect(result.success).toBe(true);
      expect((result.data as { ok: boolean }).ok).toBe(true);
    });

    test('logs network requests', async () => {
      const logs: string[] = [];
      const loggingExecutor = new SandboxExecutor({
        toolsDir,
        timeout: 5000,
        allowedPaths: [testDir],
        onNetworkRequest: (url) => logs.push(url),
      });

      const tool: GeneratedTool = {
        name: 'logged-fetcher',
        description: 'Fetches with logging',
        code: `module.exports = async (params, context) => {
          await context.fetch(params.url);
          return 'done';
        };`,
        inputSchema: { type: 'object' },
      };

      await loggingExecutor.execute(tool, { url: 'https://example.com/test' });

      expect(logs).toContain('https://example.com/test');

      await loggingExecutor.shutdown();
    });
  });

  describe('tool generation', () => {
    test('generates tool from description', async () => {
      const generatingExecutor = new SandboxExecutor({
        toolsDir,
        timeout: 5000,
        allowedPaths: [testDir],
        codeGenerator: mockGenerator,
      });

      const tool = await generatingExecutor.generate('Double a number');

      expect(tool.name).toBe('test-tool');
      expect(tool.code).toContain('module.exports');
      expect(mockGenerator.generate).toHaveBeenCalledWith('Double a number');

      await generatingExecutor.shutdown();
    });

    test('throws if no code generator configured', async () => {
      await expect(executor.generate('Something')).rejects.toThrow('No code generator');
    });
  });

  describe('tool persistence', () => {
    test('saves tool to disk', async () => {
      const tool: GeneratedTool = {
        name: 'saved-tool',
        description: 'A saved tool',
        code: 'module.exports = () => 42;',
        inputSchema: { type: 'object' },
      };

      await executor.saveTool(tool);

      const savedPath = join(toolsDir, 'saved-tool.json');
      const saved = JSON.parse(await readFile(savedPath, 'utf-8'));
      expect(saved.name).toBe('saved-tool');
      expect(saved.code).toBe('module.exports = () => 42;');
    });

    test('loads tool from disk', async () => {
      const tool: GeneratedTool = {
        name: 'loadable-tool',
        description: 'A loadable tool',
        code: 'module.exports = () => "loaded";',
        inputSchema: { type: 'object' },
      };

      await executor.saveTool(tool);
      const loaded = await executor.loadTool('loadable-tool');

      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe('loadable-tool');
      expect(loaded!.code).toBe('module.exports = () => "loaded";');
    });

    test('returns null for non-existent tool', async () => {
      const loaded = await executor.loadTool('nonexistent');
      expect(loaded).toBeNull();
    });

    test('lists saved tools', async () => {
      await executor.saveTool({
        name: 'tool-a',
        description: 'Tool A',
        code: 'module.exports = () => "a";',
        inputSchema: { type: 'object' },
      });
      await executor.saveTool({
        name: 'tool-b',
        description: 'Tool B',
        code: 'module.exports = () => "b";',
        inputSchema: { type: 'object' },
      });

      const tools = await executor.listTools();

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('tool-a');
      expect(tools.map((t) => t.name)).toContain('tool-b');
    });

    test('deletes saved tool', async () => {
      await executor.saveTool({
        name: 'deletable',
        description: 'Will be deleted',
        code: 'module.exports = () => null;',
        inputSchema: { type: 'object' },
      });

      await executor.deleteTool('deletable');

      const loaded = await executor.loadTool('deletable');
      expect(loaded).toBeNull();
    });

    test('updates tool usage stats on execute', async () => {
      const tool: GeneratedTool = {
        name: 'tracked-tool',
        description: 'Tracks usage',
        code: 'module.exports = () => "used";',
        inputSchema: { type: 'object' },
      };

      await executor.saveTool(tool);
      await executor.execute(tool, {});

      const loaded = await executor.loadTool('tracked-tool');
      expect(loaded!.useCount).toBe(1);
      expect(loaded!.lastUsed).toBeGreaterThan(0);
    });
  });

  describe('termination', () => {
    test('terminates running execution by ID', async () => {
      const tool: GeneratedTool = {
        name: 'terminatable',
        description: 'Can be terminated',
        code: `module.exports = async () => {
          await new Promise(r => setTimeout(r, 30000));
          return 'should not reach';
        };`,
        inputSchema: { type: 'object' },
      };

      // Start execution without awaiting
      const executionPromise = executor.execute(tool, {});

      // Give it a moment to start
      await new Promise((r) => setTimeout(r, 100));

      // Terminate all running executions
      executor.terminateAll();

      const result = await executionPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('terminated');
    });
  });

  describe('context injection', () => {
    test('provides params to executed code', async () => {
      const tool: GeneratedTool = {
        name: 'params-checker',
        description: 'Checks params',
        code: `module.exports = async (params) => ({
          hasA: 'a' in params,
          hasB: 'b' in params,
          a: params.a,
          b: params.b,
        });`,
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, { a: 1, b: 2 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ hasA: true, hasB: true, a: 1, b: 2 });
    });

    test('provides context object with utilities', async () => {
      const tool: GeneratedTool = {
        name: 'context-checker',
        description: 'Checks context',
        code: `module.exports = async (params, context) => ({
          hasFetch: typeof context.fetch === 'function',
          hasReadFile: typeof context.readFile === 'function',
          hasWriteFile: typeof context.writeFile === 'function',
        });`,
        inputSchema: { type: 'object' },
      };

      const result = await executor.execute(tool, {});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        hasFetch: true,
        hasReadFile: true,
        hasWriteFile: true,
      });
    });
  });
});
