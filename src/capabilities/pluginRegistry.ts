/**
 * PluginRegistry - Manages plugin registration and lookup
 *
 * Responsibilities:
 * - Register/unregister plugins
 * - Map actions to plugins
 * - Provide plugin discovery
 * - Prevent duplicate registrations
 */

import type { Plugin } from '../types';

export interface PluginInfo {
  name: string;
  actions: string[];
}

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private actionToPlugin = new Map<string, Plugin>();
  private actionToPluginName = new Map<string, string>();

  /**
   * Register a plugin.
   * @throws Error if plugin name or any of its actions are already registered
   */
  register(plugin: Plugin): void {
    // Check for duplicate plugin name
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }

    // Check for conflicting actions
    for (const action of plugin.actions) {
      if (this.actionToPlugin.has(action)) {
        const existingPlugin = this.actionToPluginName.get(action);
        throw new Error(
          `Action '${action}' is already registered by plugin '${existingPlugin}'`
        );
      }
    }

    // Register plugin
    this.plugins.set(plugin.name, plugin);

    // Register actions
    for (const action of plugin.actions) {
      this.actionToPlugin.set(action, plugin);
      this.actionToPluginName.set(action, plugin.name);
    }
  }

  /**
   * Register multiple plugins at once.
   * Stops on first error (partial registration may occur).
   */
  registerAll(plugins: Plugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  /**
   * Unregister a plugin by name.
   * No-op if plugin doesn't exist.
   */
  unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return;
    }

    // Remove action mappings
    for (const action of plugin.actions) {
      this.actionToPlugin.delete(action);
      this.actionToPluginName.delete(action);
    }

    // Remove plugin
    this.plugins.delete(name);
  }

  /**
   * Clear all registered plugins.
   */
  clear(): void {
    this.plugins.clear();
    this.actionToPlugin.clear();
    this.actionToPluginName.clear();
  }

  /**
   * Get a plugin by name.
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get the plugin that handles a specific action.
   */
  getPluginForAction(action: string): Plugin | undefined {
    return this.actionToPlugin.get(action);
  }

  /**
   * Check if a plugin exists.
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Check if an action is registered.
   */
  hasAction(action: string): boolean {
    return this.actionToPlugin.has(action);
  }

  /**
   * List all registered plugins.
   */
  listPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * List all registered actions.
   */
  listActions(): string[] {
    return Array.from(this.actionToPlugin.keys());
  }

  /**
   * Get a mapping of action names to plugin names.
   */
  getActionMapping(): Map<string, string> {
    return new Map(this.actionToPluginName);
  }

  /**
   * Get info about a specific plugin.
   */
  getPluginInfo(name: string): PluginInfo | undefined {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return undefined;
    }
    return {
      name: plugin.name,
      actions: [...plugin.actions],
    };
  }

  /**
   * Get info about all registered plugins.
   */
  getAllPluginInfo(): PluginInfo[] {
    return this.listPlugins().map((plugin) => ({
      name: plugin.name,
      actions: [...plugin.actions],
    }));
  }
}
