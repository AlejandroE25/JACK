/**
 * Wolfram Plugin Tests (TDD)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WolframPlugin } from '../../../src/plugins/core/wolframPlugin';
import { PluginCapability } from '../../../src/types/plugin';

describe('WolframPlugin', () => {
  let plugin: WolframPlugin;

  beforeEach(() => {
    plugin = new WolframPlugin();
  });

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('core.wolfram');
    expect(plugin.metadata.tags).toContain('computational');
  });

  it('should provide wolfram_query tool', () => {
    const tool = plugin.tools.find(t => t.name === 'wolfram_query');
    expect(tool).toBeDefined();
    expect(tool?.capabilities).toContain(PluginCapability.READ_ONLY);
  });

  it('should have query parameter', () => {
    const tool = plugin.tools.find(t => t.name === 'wolfram_query');
    const queryParam = tool?.parameters.find(p => p.name === 'query');
    expect(queryParam?.required).toBe(true);
  });

  it('should initialize successfully', async () => {
    await expect(plugin.initialize({ appId: 'test' })).resolves.not.toThrow();
  });

  it('should have health check', () => {
    expect(plugin.healthCheck).toBeDefined();
  });

  it('should execute query', async () => {
    await plugin.initialize({ appId: 'test' });
    const tool = plugin.tools[0];
    const result = await tool.execute({ query: '2+2' }, {
      clientId: 'test',
      conversationHistory: [],
      previousStepResults: new Map()
    });
    expect(result).toBeDefined();
  });
});
