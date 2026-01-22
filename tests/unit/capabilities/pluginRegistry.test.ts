import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { PluginRegistry } from '../../../src/capabilities/pluginRegistry';
import type { Plugin, PluginResult } from '../../../src/types';

// Helper to create mock plugins
function createMockPlugin(
  name: string,
  actions: string[],
  handler?: (action: string, params: Record<string, unknown>) => Promise<PluginResult>
): Plugin {
  return {
    name,
    actions,
    execute: mock(handler || (async () => ({ success: true, data: {} }))),
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('registration', () => {
    test('registers a plugin', () => {
      const plugin = createMockPlugin('weather', ['get_weather', 'get_forecast']);

      registry.register(plugin);

      expect(registry.getPlugin('weather')).toBe(plugin);
    });

    test('registers multiple plugins', () => {
      const weather = createMockPlugin('weather', ['get_weather']);
      const calendar = createMockPlugin('calendar', ['get_events', 'create_event']);

      registry.register(weather);
      registry.register(calendar);

      expect(registry.getPlugin('weather')).toBe(weather);
      expect(registry.getPlugin('calendar')).toBe(calendar);
    });

    test('throws error when registering duplicate plugin name', () => {
      const plugin1 = createMockPlugin('weather', ['get_weather']);
      const plugin2 = createMockPlugin('weather', ['get_forecast']);

      registry.register(plugin1);

      expect(() => registry.register(plugin2)).toThrow('already registered');
    });

    test('throws error when registering conflicting action', () => {
      const plugin1 = createMockPlugin('weather', ['get_weather']);
      const plugin2 = createMockPlugin('climate', ['get_weather']); // Same action!

      registry.register(plugin1);

      expect(() => registry.register(plugin2)).toThrow('already registered');
    });
  });

  describe('unregistration', () => {
    test('unregisters a plugin by name', () => {
      const plugin = createMockPlugin('weather', ['get_weather']);
      registry.register(plugin);

      registry.unregister('weather');

      expect(registry.getPlugin('weather')).toBeUndefined();
    });

    test('clears action mappings when unregistering', () => {
      const plugin = createMockPlugin('weather', ['get_weather', 'get_forecast']);
      registry.register(plugin);

      registry.unregister('weather');

      expect(registry.getPluginForAction('get_weather')).toBeUndefined();
      expect(registry.getPluginForAction('get_forecast')).toBeUndefined();
    });

    test('does nothing when unregistering non-existent plugin', () => {
      // Should not throw
      registry.unregister('nonexistent');
    });

    test('allows re-registration after unregistering', () => {
      const plugin1 = createMockPlugin('weather', ['get_weather']);
      const plugin2 = createMockPlugin('weather', ['get_weather', 'get_forecast']);

      registry.register(plugin1);
      registry.unregister('weather');
      registry.register(plugin2);

      expect(registry.getPlugin('weather')).toBe(plugin2);
      expect(registry.getPluginForAction('get_forecast')).toBe(plugin2);
    });
  });

  describe('plugin lookup', () => {
    test('gets plugin by name', () => {
      const plugin = createMockPlugin('weather', ['get_weather']);
      registry.register(plugin);

      expect(registry.getPlugin('weather')).toBe(plugin);
    });

    test('returns undefined for unknown plugin name', () => {
      expect(registry.getPlugin('unknown')).toBeUndefined();
    });

    test('gets plugin for action', () => {
      const plugin = createMockPlugin('weather', ['get_weather', 'get_forecast']);
      registry.register(plugin);

      expect(registry.getPluginForAction('get_weather')).toBe(plugin);
      expect(registry.getPluginForAction('get_forecast')).toBe(plugin);
    });

    test('returns undefined for unknown action', () => {
      expect(registry.getPluginForAction('unknown_action')).toBeUndefined();
    });
  });

  describe('listing', () => {
    test('lists all registered plugins', () => {
      const weather = createMockPlugin('weather', ['get_weather']);
      const calendar = createMockPlugin('calendar', ['get_events']);
      const reminders = createMockPlugin('reminders', ['create_reminder']);

      registry.register(weather);
      registry.register(calendar);
      registry.register(reminders);

      const plugins = registry.listPlugins();

      expect(plugins).toHaveLength(3);
      expect(plugins).toContain(weather);
      expect(plugins).toContain(calendar);
      expect(plugins).toContain(reminders);
    });

    test('returns empty array when no plugins registered', () => {
      expect(registry.listPlugins()).toEqual([]);
    });

    test('lists all available actions', () => {
      registry.register(createMockPlugin('weather', ['get_weather', 'get_forecast']));
      registry.register(createMockPlugin('calendar', ['get_events', 'create_event']));

      const actions = registry.listActions();

      expect(actions).toHaveLength(4);
      expect(actions).toContain('get_weather');
      expect(actions).toContain('get_forecast');
      expect(actions).toContain('get_events');
      expect(actions).toContain('create_event');
    });

    test('returns empty array when no actions registered', () => {
      expect(registry.listActions()).toEqual([]);
    });
  });

  describe('action metadata', () => {
    test('gets action-to-plugin mapping', () => {
      registry.register(createMockPlugin('weather', ['get_weather', 'get_forecast']));
      registry.register(createMockPlugin('calendar', ['get_events']));

      const mapping = registry.getActionMapping();

      expect(mapping.get('get_weather')).toBe('weather');
      expect(mapping.get('get_forecast')).toBe('weather');
      expect(mapping.get('get_events')).toBe('calendar');
    });

    test('checks if action exists', () => {
      registry.register(createMockPlugin('weather', ['get_weather']));

      expect(registry.hasAction('get_weather')).toBe(true);
      expect(registry.hasAction('unknown_action')).toBe(false);
    });

    test('checks if plugin exists', () => {
      registry.register(createMockPlugin('weather', ['get_weather']));

      expect(registry.hasPlugin('weather')).toBe(true);
      expect(registry.hasPlugin('unknown')).toBe(false);
    });
  });

  describe('bulk operations', () => {
    test('registers multiple plugins at once', () => {
      const plugins = [
        createMockPlugin('weather', ['get_weather']),
        createMockPlugin('calendar', ['get_events']),
        createMockPlugin('reminders', ['create_reminder']),
      ];

      registry.registerAll(plugins);

      expect(registry.listPlugins()).toHaveLength(3);
    });

    test('stops registration on first error in bulk register', () => {
      const plugins = [
        createMockPlugin('weather', ['get_weather']),
        createMockPlugin('weather', ['get_forecast']), // Duplicate name
        createMockPlugin('calendar', ['get_events']),
      ];

      expect(() => registry.registerAll(plugins)).toThrow('already registered');
      // First plugin should be registered, others not
      expect(registry.hasPlugin('weather')).toBe(true);
      expect(registry.hasPlugin('calendar')).toBe(false);
    });

    test('clears all plugins', () => {
      registry.register(createMockPlugin('weather', ['get_weather']));
      registry.register(createMockPlugin('calendar', ['get_events']));

      registry.clear();

      expect(registry.listPlugins()).toEqual([]);
      expect(registry.listActions()).toEqual([]);
    });
  });

  describe('plugin info', () => {
    test('gets plugin info including actions', () => {
      const plugin = createMockPlugin('weather', ['get_weather', 'get_forecast']);
      registry.register(plugin);

      const info = registry.getPluginInfo('weather');

      expect(info).toEqual({
        name: 'weather',
        actions: ['get_weather', 'get_forecast'],
      });
    });

    test('returns undefined for unknown plugin info', () => {
      expect(registry.getPluginInfo('unknown')).toBeUndefined();
    });

    test('gets all plugin info', () => {
      registry.register(createMockPlugin('weather', ['get_weather']));
      registry.register(createMockPlugin('calendar', ['get_events', 'create_event']));

      const allInfo = registry.getAllPluginInfo();

      expect(allInfo).toHaveLength(2);
      expect(allInfo).toContainEqual({ name: 'weather', actions: ['get_weather'] });
      expect(allInfo).toContainEqual({ name: 'calendar', actions: ['get_events', 'create_event'] });
    });
  });
});
