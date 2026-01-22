/**
 * Core types for JACK
 */

// Message types for WebSocket communication
export type MessageType =
  // Client → Server
  | 'connect'
  | 'input'
  | 'interrupt'
  | 'task_status'
  | 'context_update'
  // Server → Client
  | 'connected'
  | 'ack'
  | 'speech'
  | 'document'
  | 'progress'
  | 'error'
  | 'clarify';

// Base message envelope
export interface Message<T = unknown> {
  id: string;           // UUID for request/response correlation
  type: MessageType;    // Message type
  ts: number;           // Unix timestamp ms
  payload: T;           // Type-specific data
}

// Client → Server payloads
export interface ConnectPayload {
  clientId?: string;                       // Existing ID (omit if new)
  clientType: 'cli' | 'web' | 'mobile';
  version: string;
}

export interface InputPayload {
  text: string;
}

export interface InterruptPayload {}

export interface TaskStatusPayload {
  taskId: string;
}

export interface ContextUpdatePayload {
  type: string;
  data: unknown;
}

// Server → Client payloads
export interface ConnectedPayload {
  clientId: string;      // Confirmed or newly assigned
  isReconnect: boolean;  // true if existing client restored
}

export interface AckPayload {
  text: string;
  audio: Uint8Array;
}

export interface SpeechPayload {
  text: string;
  audio: Uint8Array;
}

export interface DocumentPayload {
  path: string;
  type: 'markdown' | 'code' | 'data';
}

export interface ProgressPayload {
  taskId: string;
  status: 'started' | 'progress' | 'completed' | 'failed' | 'skipped';
  message?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ClarifyPayload {
  question: string;
  options?: string[];
}

// Intent Parser types
export interface ParsedIntent {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  dependencies: string[];  // Intent IDs this depends on
  conditional?: boolean;   // Only execute if dependency result allows
  conditionExpr?: string;  // Expression to evaluate against prior results
}

export interface IntentParseResult {
  intents: ParsedIntent[];
  executionOrder: string[][];  // Parallel groups (each group runs in parallel, groups run sequentially)
  requiresAcknowledgment: boolean;
  clarificationNeeded?: {
    question: string;
    options?: string[];
  };
}

// Actions that are fast enough to skip acknowledgment
export const FAST_ACTIONS = [
  'get_time',
  'get_date',
  'get_weather',
  'simple_math',
] as const;

export type FastAction = typeof FAST_ACTIONS[number];

// Modality Engine types
export interface ModalityDecision {
  voice: boolean;
  document: boolean;
  documentType?: 'markdown' | 'code' | 'data';
  documentLocation?: string;
  autoOpen: boolean;
  highlights?: string;  // Key points for voice when document is generated
}

export interface ExecutionResult {
  intentId: string;
  action: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Content type hints for modality decisions
export type ContentType =
  | 'simple_answer'    // Short fact, yes/no, confirmation
  | 'complex_result'   // Research, analysis, comparison
  | 'code'             // Generated code
  | 'data'             // Tables, exports, logs
  | 'error';           // Error that needs user decision

// Orchestrator types
export interface UserInput {
  clientId: string;
  text: string;
  timestamp: number;
}

export interface TaskStatus {
  taskId: string;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  intents: ParsedIntent[];
  results: ExecutionResult[];
  startedAt: number;
  completedAt?: number;
}

// Context Manager types

/**
 * Three-tier context system:
 * 1. Short-term: Recent intents (3 turns or 60 seconds)
 * 2. Session: Active resources (until disconnect)
 * 3. Long-term: Persisted key-value memory (SQLite)
 */

// Short-term context: recent conversation turns
export interface RecentIntent {
  intent: ParsedIntent;
  result: unknown;
  timestamp: number;
}

// Session context: active resource being worked on
export interface ActiveResource {
  type: 'file' | 'project' | 'url' | 'conversation';
  path?: string;
  metadata?: Record<string, unknown>;
  activatedAt: number;
}

// Long-term memory: namespaced key-value pairs
// Namespaces: user.*, preference.*, project.*, person.*, tool.*
export type MemoryValue = string | number | boolean | null;

export interface MemoryEntry {
  key: string;
  value: MemoryValue;
  updatedAt: number;
}

// Context snapshot for passing to Intent Parser
export interface ContextSnapshot {
  recentIntents: RecentIntent[];
  activeResource: ActiveResource | null;
  relevantMemory: Record<string, MemoryValue>;
}

// Action Executor types

export type ProgressStatus =
  | { type: 'started' }
  | { type: 'progress'; message: string }
  | { type: 'completed'; result: unknown }
  | { type: 'failed'; error: string }
  | { type: 'skipped'; reason: string };

export interface ProgressCallback {
  (intentId: string, status: ProgressStatus): void;
}

// Plugin types

export interface PluginResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface Plugin {
  name: string;
  actions: string[];
  execute(action: string, params: Record<string, unknown>): Promise<PluginResult>;
}
