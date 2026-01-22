import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { ActionExecutor } from '../../../src/capabilities/actionExecutor';
import type { ParsedIntent, ExecutionResult, ProgressStatus, Plugin, PluginResult } from '../../../src/types';

// Mock plugin for testing
function createMockPlugin(
  name: string,
  actions: string[],
  handler: (action: string, params: Record<string, unknown>) => Promise<PluginResult>
): Plugin {
  return {
    name,
    actions,
    execute: mock(handler),
  };
}

describe('ActionExecutor', () => {
  describe('execute single intent', () => {
    test('executes intent via plugin and returns result', async () => {
      const weatherPlugin = createMockPlugin('weather', ['get_weather'], async () => ({
        success: true,
        data: { temp: 72, conditions: 'sunny' },
      }));

      const executor = new ActionExecutor([weatherPlugin]);

      const intent: ParsedIntent = {
        id: 'i1',
        action: 'get_weather',
        parameters: { location: 'SF' },
        dependencies: [],
      };

      const result = await executor.execute(intent);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ temp: 72, conditions: 'sunny' });
      expect(weatherPlugin.execute).toHaveBeenCalledWith('get_weather', { location: 'SF' });
    });

    test('returns error for unknown action', async () => {
      const executor = new ActionExecutor([]);

      const intent: ParsedIntent = {
        id: 'i1',
        action: 'unknown_action',
        parameters: {},
        dependencies: [],
      };

      const result = await executor.execute(intent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No plugin found');
    });

    test('propagates plugin errors', async () => {
      const failingPlugin = createMockPlugin('failing', ['fail'], async () => ({
        success: false,
        error: 'API rate limit exceeded',
      }));

      const executor = new ActionExecutor([failingPlugin]);

      const intent: ParsedIntent = {
        id: 'i1',
        action: 'fail',
        parameters: {},
        dependencies: [],
      };

      const result = await executor.execute(intent);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limit exceeded');
    });

    test('catches plugin exceptions', async () => {
      const throwingPlugin = createMockPlugin('throwing', ['throw'], async () => {
        throw new Error('Unexpected error');
      });

      const executor = new ActionExecutor([throwingPlugin]);

      const intent: ParsedIntent = {
        id: 'i1',
        action: 'throw',
        parameters: {},
        dependencies: [],
      };

      const result = await executor.execute(intent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error');
    });
  });

  describe('executeAll with execution order', () => {
    test('executes intents in parallel within same group', async () => {
      const executionOrder: string[] = [];

      const slowPlugin = createMockPlugin('slow', ['slow_action'], async (action, params) => {
        await new Promise((r) => setTimeout(r, 50));
        executionOrder.push(`slow-${params.id}`);
        return { success: true, data: { id: params.id } };
      });

      const executor = new ActionExecutor([slowPlugin]);

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'slow_action', parameters: { id: 1 }, dependencies: [] },
        { id: 'i2', action: 'slow_action', parameters: { id: 2 }, dependencies: [] },
      ];

      const start = Date.now();
      await executor.executeAll(intents, [['i1', 'i2']]);
      const duration = Date.now() - start;

      // If run in parallel, should take ~50ms, not ~100ms
      expect(duration).toBeLessThan(100);
      expect(executionOrder).toHaveLength(2);
    });

    test('executes groups sequentially', async () => {
      const executionOrder: string[] = [];

      const trackingPlugin = createMockPlugin('tracking', ['track'], async (action, params) => {
        executionOrder.push(params.id as string);
        return { success: true, data: { id: params.id } };
      });

      const executor = new ActionExecutor([trackingPlugin]);

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'track', parameters: { id: 'first' }, dependencies: [] },
        { id: 'i2', action: 'track', parameters: { id: 'second' }, dependencies: ['i1'] },
      ];

      await executor.executeAll(intents, [['i1'], ['i2']]);

      expect(executionOrder).toEqual(['first', 'second']);
    });

    test('makes prior results available to dependent intents', async () => {
      let receivedContext: Record<string, unknown> | undefined;

      const contextPlugin = createMockPlugin('context', ['step1', 'step2'], async (action, params) => {
        if (action === 'step1') {
          return { success: true, data: { value: 42 } };
        }
        receivedContext = params._priorResults as Record<string, unknown>;
        return { success: true, data: {} };
      });

      const executor = new ActionExecutor([contextPlugin]);

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'step1', parameters: {}, dependencies: [] },
        { id: 'i2', action: 'step2', parameters: {}, dependencies: ['i1'] },
      ];

      await executor.executeAll(intents, [['i1'], ['i2']]);

      expect(receivedContext).toBeDefined();
      expect((receivedContext?.i1 as { data: { value: number } })?.data?.value).toBe(42);
    });

    test('skips dependent intents when dependency fails', async () => {
      const mixedPlugin = createMockPlugin('mixed', ['fail', 'depend'], async (action) => {
        if (action === 'fail') {
          return { success: false, error: 'Failed intentionally' };
        }
        return { success: true, data: {} };
      });

      const executor = new ActionExecutor([mixedPlugin]);

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'fail', parameters: {}, dependencies: [] },
        { id: 'i2', action: 'depend', parameters: {}, dependencies: ['i1'] },
      ];

      const results = await executor.executeAll(intents, [['i1'], ['i2']]);

      expect(results.get('i1')?.success).toBe(false);
      expect(results.get('i2')?.success).toBe(false);
      expect(results.get('i2')?.error).toContain('Skipped');
    });

    test('continues independent intents when one fails', async () => {
      const mixedPlugin = createMockPlugin('mixed', ['fail', 'succeed'], async (action) => {
        if (action === 'fail') {
          return { success: false, error: 'Failed' };
        }
        return { success: true, data: { ok: true } };
      });

      const executor = new ActionExecutor([mixedPlugin]);

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'fail', parameters: {}, dependencies: [] },
        { id: 'i2', action: 'succeed', parameters: {}, dependencies: [] },
      ];

      const results = await executor.executeAll(intents, [['i1', 'i2']]);

      expect(results.get('i1')?.success).toBe(false);
      expect(results.get('i2')?.success).toBe(true);
    });
  });

  describe('conditional execution', () => {
    test('executes conditional intent when condition is true', async () => {
      const condPlugin = createMockPlugin('cond', ['check', 'act'], async (action) => {
        if (action === 'check') {
          return { success: true, data: { shouldAct: true } };
        }
        return { success: true, data: { acted: true } };
      });

      const executor = new ActionExecutor([condPlugin]);

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'check', parameters: {}, dependencies: [] },
        {
          id: 'i2',
          action: 'act',
          parameters: {},
          dependencies: ['i1'],
          conditional: true,
          conditionExpr: 'i1.data.shouldAct === true',
        },
      ];

      const results = await executor.executeAll(intents, [['i1'], ['i2']]);

      expect(results.get('i2')?.success).toBe(true);
      expect((results.get('i2')?.data as { acted: boolean })?.acted).toBe(true);
    });

    test('skips conditional intent when condition is false', async () => {
      const condPlugin = createMockPlugin('cond', ['check', 'act'], async (action) => {
        if (action === 'check') {
          return { success: true, data: { shouldAct: false } };
        }
        return { success: true, data: { acted: true } };
      });

      const executor = new ActionExecutor([condPlugin]);

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'check', parameters: {}, dependencies: [] },
        {
          id: 'i2',
          action: 'act',
          parameters: {},
          dependencies: ['i1'],
          conditional: true,
          conditionExpr: 'i1.data.shouldAct === true',
        },
      ];

      const results = await executor.executeAll(intents, [['i1'], ['i2']]);

      expect(results.get('i2')?.success).toBe(false);
      expect(results.get('i2')?.error).toContain('Skipped');
      expect(results.get('i2')?.error).toContain('condition');
    });
  });

  describe('progress callbacks', () => {
    test('calls progress callback on start', async () => {
      const plugin = createMockPlugin('test', ['test'], async () => ({
        success: true,
        data: {},
      }));

      const executor = new ActionExecutor([plugin]);
      const progressCalls: Array<{ intentId: string; status: ProgressStatus }> = [];

      const intent: ParsedIntent = {
        id: 'i1',
        action: 'test',
        parameters: {},
        dependencies: [],
      };

      await executor.executeAll([intent], [['i1']], (intentId, status) => {
        progressCalls.push({ intentId, status });
      });

      expect(progressCalls.some((c) => c.status.type === 'started')).toBe(true);
    });

    test('calls progress callback on completion', async () => {
      const plugin = createMockPlugin('test', ['test'], async () => ({
        success: true,
        data: { result: 'ok' },
      }));

      const executor = new ActionExecutor([plugin]);
      const progressCalls: Array<{ intentId: string; status: ProgressStatus }> = [];

      const intent: ParsedIntent = {
        id: 'i1',
        action: 'test',
        parameters: {},
        dependencies: [],
      };

      await executor.executeAll([intent], [['i1']], (intentId, status) => {
        progressCalls.push({ intentId, status });
      });

      const completedCall = progressCalls.find((c) => c.status.type === 'completed');
      expect(completedCall).toBeDefined();
      expect((completedCall?.status as { type: 'completed'; result: unknown }).result).toEqual({ result: 'ok' });
    });

    test('calls progress callback on failure', async () => {
      const plugin = createMockPlugin('test', ['test'], async () => ({
        success: false,
        error: 'Test error',
      }));

      const executor = new ActionExecutor([plugin]);
      const progressCalls: Array<{ intentId: string; status: ProgressStatus }> = [];

      const intent: ParsedIntent = {
        id: 'i1',
        action: 'test',
        parameters: {},
        dependencies: [],
      };

      await executor.executeAll([intent], [['i1']], (intentId, status) => {
        progressCalls.push({ intentId, status });
      });

      const failedCall = progressCalls.find((c) => c.status.type === 'failed');
      expect(failedCall).toBeDefined();
      expect((failedCall?.status as { type: 'failed'; error: string }).error).toBe('Test error');
    });

    test('calls progress callback on skip', async () => {
      const plugin = createMockPlugin('test', ['fail', 'depend'], async (action) => {
        if (action === 'fail') return { success: false, error: 'Failed' };
        return { success: true, data: {} };
      });

      const executor = new ActionExecutor([plugin]);
      const progressCalls: Array<{ intentId: string; status: ProgressStatus }> = [];

      const intents: ParsedIntent[] = [
        { id: 'i1', action: 'fail', parameters: {}, dependencies: [] },
        { id: 'i2', action: 'depend', parameters: {}, dependencies: ['i1'] },
      ];

      await executor.executeAll(intents, [['i1'], ['i2']], (intentId, status) => {
        progressCalls.push({ intentId, status });
      });

      const skippedCall = progressCalls.find((c) => c.intentId === 'i2' && c.status.type === 'skipped');
      expect(skippedCall).toBeDefined();
    });
  });
});
