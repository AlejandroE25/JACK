/**
 * Plugin System Type Definitions
 *
 * This module defines the core interfaces for the proPACE plugin architecture.
 * All plugins must implement the Plugin interface to be registered and used by the system.
 */

/**
 * Plugin capabilities define what type of operations a plugin tool can perform
 */
export enum PluginCapability {
  /** Read-only operations that don't modify state (auto-approved) */
  READ_ONLY = 'read_only',

  /** Operations that modify state (require permission) */
  STATE_CHANGING = 'state_changing',

  /** Long-running asynchronous tasks */
  ASYNC_TASK = 'async_task',

  /** Supports streaming responses */
  STREAMING = 'streaming'
}

/**
 * Parameter type definition for plugin tools
 */
export type PluginParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * Validation result for plugin parameters
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Plugin tool parameter definition
 */
export interface PluginParameter {
  /** Parameter name */
  name: string;

  /** Parameter type */
  type: PluginParameterType;

  /** Human-readable description of the parameter */
  description: string;

  /** Whether this parameter is required */
  required: boolean;

  /** Default value if not provided */
  default?: any;

  /** Optional custom validation function */
  validation?: (value: any) => boolean;
}

/**
 * Execution context provided to plugin tools
 */
export interface ExecutionContext {
  /** Client ID making the request */
  clientId: string;

  /** User ID (future: for identity management) */
  userId?: string;

  /** Conversation history for context */
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;

  /** Results from previous steps (for tool chaining) */
  previousStepResults: Map<string, any>;

  /** Global context snapshot (cross-client information) */
  globalContext?: any;
}

/**
 * Result returned by a plugin tool execution
 */
export interface ToolResult {
  /** Whether the execution was successful */
  success: boolean;

  /** Result data (if successful) */
  data?: any;

  /** Error message (if failed) */
  error?: string;

  /** Execution metadata */
  metadata?: {
    /** Execution duration in milliseconds */
    duration: number;

    /** Whether result was from cache */
    cached: boolean;

    /** Additional metadata */
    [key: string]: any;
  };
}

/**
 * Plugin tool definition - represents a single capability/function
 */
export interface PluginTool {
  /** Unique tool name (e.g., 'get_weather', 'send_email') */
  name: string;

  /** Human-readable description of what the tool does */
  description: string;

  /** Category for grouping (e.g., 'weather', 'productivity', 'smart_home') */
  category: string;

  /** Tool capabilities */
  capabilities: PluginCapability[];

  /** Tool parameters */
  parameters: PluginParameter[];

  /** Execute the tool with given parameters and context */
  execute: (params: Record<string, any>, context: ExecutionContext) => Promise<ToolResult>;

  /** Optional parameter validation */
  validate?: (params: Record<string, any>) => ValidationResult;
}

/**
 * Plugin metadata - information about the plugin itself
 */
export interface PluginMetadata {
  /** Unique plugin ID (e.g., 'core.weather', 'productivity.gmail') */
  id: string;

  /** Human-readable plugin name */
  name: string;

  /** Plugin version (semver) */
  version: string;

  /** Plugin author */
  author: string;

  /** Plugin description */
  description: string;

  /** Tags for categorization */
  tags: string[];

  /** Plugin dependencies (other plugin IDs) */
  dependencies?: string[];

  /** Configuration schema (JSON schema for plugin config) */
  configSchema?: Record<string, any>;
}

/**
 * Main plugin interface - all plugins must implement this
 */
export interface Plugin {
  /** Plugin metadata */
  metadata: PluginMetadata;

  /** Tools provided by this plugin */
  tools: PluginTool[];

  /** Initialize the plugin with configuration */
  initialize: (config: Record<string, any>) => Promise<void>;

  /** Optional cleanup on plugin shutdown */
  shutdown?: () => Promise<void>;

  /** Optional health check */
  healthCheck?: () => Promise<boolean>;
}

/**
 * Plugin registry events
 */
export enum PluginRegistryEvent {
  PLUGIN_REGISTERED = 'plugin_registered',
  PLUGIN_UNREGISTERED = 'plugin_unregistered',
  PLUGIN_INITIALIZED = 'plugin_initialized',
  PLUGIN_FAILED = 'plugin_failed'
}

/**
 * Event emitted by the plugin registry
 */
export interface PluginRegistryEventData {
  event: PluginRegistryEvent;
  pluginId: string;
  timestamp: Date;
  error?: Error;
}
