/**
 * Plugin Registry
 *
 * Central registry for all plugins in the proPACE system.
 * Manages plugin lifecycle, tool indexing, and dependency validation.
 */

import {
  PluginRegistryEvent,
  type Plugin,
  type PluginTool,
  type PluginMetadata,
  type PluginRegistryEventData
} from '../types/plugin';
import { logger } from '../utils/logger';

/**
 * PluginRegistry manages all registered plugins and provides
 * efficient lookup of tools by name and category.
 */
export class PluginRegistry {
  /** Map of plugin ID to Plugin */
  private plugins: Map<string, Plugin>;

  /** Map of tool name to PluginTool */
  private toolIndex: Map<string, PluginTool>;

  /** Map of category to array of PluginTools */
  private categoryIndex: Map<string, PluginTool[]>;

  /** Event listeners for plugin registry events */
  private eventListeners: Array<(event: PluginRegistryEventData) => void>;

  constructor() {
    this.plugins = new Map();
    this.toolIndex = new Map();
    this.categoryIndex = new Map();
    this.eventListeners = [];

    logger.info('PluginRegistry initialized');
  }

  /**
   * Register a plugin with the registry
   *
   * @param plugin Plugin to register
   * @throws Error if plugin ID already registered or dependencies not satisfied
   */
  async register(plugin: Plugin): Promise<void> {
    const { id } = plugin.metadata;

    // Check for duplicate registration
    if (this.plugins.has(id)) {
      throw new Error(`Plugin with ID '${id}' is already registered`);
    }

    // Validate dependencies
    if (!this.validateDependencies(plugin)) {
      const missing = plugin.metadata.dependencies?.filter(dep => !this.plugins.has(dep)) || [];
      throw new Error(
        `Plugin '${id}' has unsatisfied dependencies: ${missing.join(', ')}`
      );
    }

    try {
      // Initialize plugin
      await plugin.initialize({});

      // Register plugin
      this.plugins.set(id, plugin);

      // Index all tools
      for (const tool of plugin.tools) {
        this.indexTool(tool);
      }

      // Emit event
      this.emitEvent({
        event: PluginRegistryEvent.PLUGIN_REGISTERED,
        pluginId: id,
        timestamp: new Date()
      });

      logger.info(`Plugin registered: ${id} (${plugin.tools.length} tools)`);
    } catch (error) {
      this.emitEvent({
        event: PluginRegistryEvent.PLUGIN_FAILED,
        pluginId: id,
        timestamp: new Date(),
        error: error as Error
      });

      throw new Error(`Failed to register plugin '${id}': ${(error as Error).message}`);
    }
  }

  /**
   * Unregister a plugin from the registry
   *
   * @param pluginId Plugin ID to unregister
   * @throws Error if plugin not found
   */
  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    try {
      // Call shutdown hook if available
      if (plugin.shutdown) {
        await plugin.shutdown();
      }

      // Remove all tools from indexes
      for (const tool of plugin.tools) {
        this.removeToolFromIndex(tool);
      }

      // Remove plugin
      this.plugins.delete(pluginId);

      // Emit event
      this.emitEvent({
        event: PluginRegistryEvent.PLUGIN_UNREGISTERED,
        pluginId,
        timestamp: new Date()
      });

      logger.info(`Plugin unregistered: ${pluginId}`);
    } catch (error) {
      throw new Error(`Failed to unregister plugin '${pluginId}': ${(error as Error).message}`);
    }
  }

  /**
   * Get a tool by name
   *
   * @param toolName Tool name to look up
   * @returns PluginTool if found, undefined otherwise
   */
  getTool(toolName: string): PluginTool | undefined {
    return this.toolIndex.get(toolName);
  }

  /**
   * Get all tools in a category
   *
   * @param category Category name
   * @returns Array of PluginTools in the category
   */
  getToolsByCategory(category: string): PluginTool[] {
    return this.categoryIndex.get(category) || [];
  }

  /**
   * Get all registered tools
   *
   * @returns Array of all PluginTools
   */
  getAllTools(): PluginTool[] {
    return Array.from(this.toolIndex.values());
  }

  /**
   * List all registered plugin metadata
   *
   * @returns Array of PluginMetadata
   */
  listPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values()).map(plugin => plugin.metadata);
  }

  /**
   * Get plugin metadata by ID
   *
   * @param pluginId Plugin ID
   * @returns PluginMetadata if found, undefined otherwise
   */
  getPluginMetadata(pluginId: string): PluginMetadata | undefined {
    return this.plugins.get(pluginId)?.metadata;
  }

  /**
   * Validate that a plugin's dependencies are satisfied
   *
   * @param plugin Plugin to validate
   * @returns true if dependencies are satisfied, false otherwise
   */
  validateDependencies(plugin: Plugin): boolean {
    const { dependencies } = plugin.metadata;

    // No dependencies - always valid
    if (!dependencies || dependencies.length === 0) {
      return true;
    }

    // Check all dependencies are registered
    return dependencies.every(depId => this.plugins.has(depId));
  }

  /**
   * Get count of registered plugins
   *
   * @returns Number of registered plugins
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Get count of registered tools
   *
   * @returns Number of registered tools
   */
  getToolCount(): number {
    return this.toolIndex.size;
  }

  /**
   * Add event listener for plugin registry events
   *
   * @param listener Event listener function
   */
  on(listener: (event: PluginRegistryEventData) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   *
   * @param listener Event listener to remove
   */
  off(listener: (event: PluginRegistryEventData) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Index a tool for fast lookup
   *
   * @param tool Tool to index
   * @private
   */
  private indexTool(tool: PluginTool): void {
    // Index by name
    this.toolIndex.set(tool.name, tool);

    // Index by category
    if (!this.categoryIndex.has(tool.category)) {
      this.categoryIndex.set(tool.category, []);
    }
    this.categoryIndex.get(tool.category)!.push(tool);
  }

  /**
   * Remove a tool from all indexes
   *
   * @param tool Tool to remove
   * @private
   */
  private removeToolFromIndex(tool: PluginTool): void {
    // Remove from tool index
    this.toolIndex.delete(tool.name);

    // Remove from category index
    const categoryTools = this.categoryIndex.get(tool.category);
    if (categoryTools) {
      const index = categoryTools.findIndex(t => t.name === tool.name);
      if (index !== -1) {
        categoryTools.splice(index, 1);
      }

      // Remove category if empty
      if (categoryTools.length === 0) {
        this.categoryIndex.delete(tool.category);
      }
    }
  }

  /**
   * Emit an event to all listeners
   *
   * @param event Event data
   * @private
   */
  private emitEvent(event: PluginRegistryEventData): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Error in plugin registry event listener', error);
      }
    }
  }
}
