# JACK v2 Implementation Guide

This document provides detailed implementation specifications for each component. Someone should be able to recreate this project entirely from this spec.

---

## Project Setup

### Runtime & Dependencies

**Runtime**: Bun (not Node.js)
- Faster startup, native TypeScript, built-in SQLite
- Install: `curl -fsSL https://bun.sh/install | bash`

**Dependencies** (`package.json`):
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@msgpack/msgpack": "^3.0.0-beta2",
    "ajv": "^8.17.1"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.7.2"
  }
}
```

### Directory Structure

```
JACK/
├── src/
│   ├── core/           # Core utilities (EventBus)
│   ├── protocol/       # Message encoding (Codec)
│   ├── server/         # WebSocket server
│   └── types/          # TypeScript type definitions
├── tests/
│   └── unit/
│       ├── core/
│       ├── protocol/
│       └── server/
├── docs/
├── bunfig.toml         # Bun configuration
├── package.json
└── tsconfig.json
```

### Configuration Files

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "archive"]
}
```

**`bunfig.toml`**:
```toml
[test]
root = "tests"
```

---

## Component 1: Types (`src/types/index.ts`)

Core type definitions for the entire system.

### Message Types

```typescript
export type MessageType =
  // Client → Server
  | 'connect'         // Initial connection
  | 'input'           // User text/voice input
  | 'interrupt'       // Stop current task
  | 'task_status'     // Request task status
  | 'context_update'  // Client context (location, etc.)
  // Server → Client
  | 'connected'       // Connection confirmed
  | 'ack'             // Brief acknowledgment
  | 'speech'          // Voice response
  | 'document'        // Document created
  | 'progress'        // Task progress update
  | 'error'           // Error occurred
  | 'clarify';        // Need user clarification
```

### Message Envelope

All messages use this envelope:

```typescript
export interface Message<T = unknown> {
  id: string;           // UUID for correlation
  type: MessageType;    // Message type
  ts: number;           // Unix timestamp (ms)
  payload: T;           // Type-specific data
}
```

### Payload Types

**Client → Server**:

```typescript
interface ConnectPayload {
  clientId?: string;                       // Existing ID (omit if new)
  clientType: 'cli' | 'web' | 'mobile';
  version: string;
}

interface InputPayload {
  text: string;
}

interface InterruptPayload {}

interface TaskStatusPayload {
  taskId: string;
}

interface ContextUpdatePayload {
  type: string;
  data: unknown;
}
```

**Server → Client**:

```typescript
interface ConnectedPayload {
  clientId: string;      // Confirmed or newly assigned
  isReconnect: boolean;  // true if existing client restored
}

interface AckPayload {
  text: string;
  audio: Uint8Array;
}

interface SpeechPayload {
  text: string;
  audio: Uint8Array;
}

interface DocumentPayload {
  path: string;
  type: 'markdown' | 'code' | 'data';
}

interface ProgressPayload {
  taskId: string;
  status: 'started' | 'progress' | 'completed' | 'failed' | 'skipped';
  message?: string;
}

interface ErrorPayload {
  code: string;
  message: string;
}

interface ClarifyPayload {
  question: string;
  options?: string[];
}
```

---

## Component 2: Protocol Codec (`src/protocol/codec.ts`)

MessagePack encoder/decoder for all WebSocket messages.

### Why MessagePack?

- 2-4x faster than JSON parse/stringify
- ~30% smaller payloads
- Native binary support (important for audio)

### Interface

```typescript
export class Codec {
  encode(message: Message): Uint8Array;
  decode(data: Uint8Array): Message;
}
```

### Implementation

```typescript
import { encode, decode } from '@msgpack/msgpack';
import type { Message } from '../types';

export class Codec {
  encode(message: Message): Uint8Array {
    return encode(message);
  }

  decode(data: Uint8Array): Message {
    return decode(data) as Message;
  }
}
```

### Test Cases

1. **Encode**: Produces `Uint8Array`, smaller than JSON
2. **Decode**: Restores original structure exactly
3. **Binary data**: `Uint8Array` in payload survives roundtrip
4. **All message types**: Every `MessageType` encodes/decodes correctly
5. **Nested objects**: Deep structures survive roundtrip
6. **Arrays**: Array payloads (like `options` in `clarify`) work
7. **Null values**: `null` becomes `null` (not lost)
8. **Invalid data**: Throws on malformed MessagePack

---

## Component 3: EventBus (`src/core/eventBus.ts`)

Simple pub/sub for decoupled component communication.

### Design Decisions

- **No priority lanes**: Speech runs in separate process, already non-blocking
- **Handler isolation**: One error doesn't stop other handlers
- **Unsubscribe function**: Clean cleanup pattern

### Interface

```typescript
export class EventBus {
  on<T>(type: string, handler: (payload: T) => void): () => void;
  once<T>(type: string, handler: (payload: T) => void): () => void;
  emit<T>(type: string, payload: T): void;
}
```

### Implementation

```typescript
type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<T>(type: string, handler: Handler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const typeHandlers = this.handlers.get(type)!;
    typeHandlers.add(handler as Handler<unknown>);

    return () => typeHandlers.delete(handler as Handler<unknown>);
  }

  once<T>(type: string, handler: Handler<T>): () => void {
    const wrappedHandler: Handler<T> = (payload) => {
      unsubscribe();
      handler(payload);
    };
    const unsubscribe = this.on(type, wrappedHandler);
    return unsubscribe;
  }

  emit<T>(type: string, payload: T): void {
    const typeHandlers = this.handlers.get(type);
    if (!typeHandlers) return;

    // Copy to array to handle unsubscribes during iteration
    const handlersSnapshot = Array.from(typeHandlers);
    for (const handler of handlersSnapshot) {
      if (typeHandlers.has(handler)) {
        try {
          handler(payload);
        } catch {
          // Swallow to prevent one bad handler breaking others
        }
      }
    }
  }
}
```

### Test Cases

1. **Basic emit/on**: Handler receives payload
2. **Multiple handlers**: All handlers called
3. **Different types**: Only matching type handlers called
4. **Typed payload**: TypeScript generics work
5. **Unsubscribe**: Returned function stops future calls
6. **Unsubscribe specific**: Other handlers still work
7. **Unsubscribe idempotent**: Multiple calls don't throw
8. **Once**: Handler called exactly once
9. **Once unsubscribe**: Can prevent the one call
10. **No handlers**: Emit doesn't throw
11. **Self-unsubscribe**: Handler can unsubscribe during emit
12. **Handler errors**: Don't prevent other handlers
13. **Many subscribers**: 1000 handlers work efficiently

---

## Component 4: WebSocket Server (`src/server/websocket.ts`)

Bun-native WebSocket server with persistent client IDs.

### Design Decisions

- **Persistent client IDs**: Survive reconnections
- **MessagePack encoding**: All messages binary
- **Handler registration**: Callbacks for `input` and `interrupt`
- **Graceful disconnect**: Send to disconnected client doesn't throw

### Interface

```typescript
export interface ServerConfig {
  port: number;
  hostname?: string;
}

export class JackServer {
  constructor(config: ServerConfig);

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // Event handlers
  onInput(handler: (clientId: string, text: string) => void): void;
  onInterrupt(handler: (clientId: string) => void): void;

  // Send messages
  sendSpeech(clientId: string, text: string, audio: Uint8Array): void;
  sendAck(clientId: string, text: string, audio: Uint8Array): void;
  sendError(clientId: string, code: string, message: string): void;
  sendDocument(clientId: string, path: string, type: 'markdown' | 'code' | 'data'): void;
  sendProgress(clientId: string, taskId: string, status: string, message?: string): void;
  sendClarify(clientId: string, question: string, options?: string[]): void;

  // Client tracking
  getClientCount(): number;
  getClientIds(): string[];
}
```

### Connection Protocol

1. Client opens WebSocket connection
2. Client sends `connect` message with optional `clientId`
3. Server responds with `connected` containing:
   - `clientId`: Assigned or confirmed ID
   - `isReconnect`: `true` if ID was recognized

### Client ID Persistence

```typescript
private knownClientIds = new Set<string>(); // Survives disconnects

private handleConnect(ws, message) {
  const { clientId: requestedId, clientType, version } = message.payload;

  if (requestedId && this.knownClientIds.has(requestedId)) {
    // Restore existing
    clientId = requestedId;
    isReconnect = true;
  } else {
    // Assign new
    clientId = crypto.randomUUID();
    this.knownClientIds.add(clientId);
  }
  // ...
}
```

### Test Cases

1. **Connection**: Accepts WebSocket, assigns ID
2. **Unique IDs**: Different clients get different IDs
3. **Reconnect**: Same ID restored when provided
4. **isReconnect true**: Returning clients get `true`
5. **isReconnect false**: New clients get `false`
6. **Input handling**: `onInput` callback receives clientId + text
7. **Interrupt handling**: `onInterrupt` callback receives clientId
8. **Send speech**: Client receives speech message
9. **Send ack**: Client receives ack message
10. **Send error**: Client receives error message
11. **Disconnected send**: Doesn't throw
12. **Client tracking**: `getClientCount()` accurate
13. **Client list**: `getClientIds()` returns all connected

---

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/protocol/codec.test.ts

# Watch mode
bun test --watch
```

---

## Phase 2: UI Layer

### Component 5: Intent Parser (`src/ui/intentParser.ts`)

Parses natural language input into structured intents using Claude (Haiku) for NLP.

#### Design Decisions

- **Claude handles NLP**: Text → structured intents (requires AI)
- **Hardcoded acknowledgment logic**: Faster, testable, predictable (no AI needed)
- **Context support**: Passes recent intents for follow-up resolution

#### Types

```typescript
interface ParsedIntent {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  dependencies: string[];  // Intent IDs this depends on
  conditional?: boolean;   // Only execute if dependency result allows
  conditionExpr?: string;  // Expression to evaluate against prior results
}

interface IntentParseResult {
  intents: ParsedIntent[];
  executionOrder: string[][];  // Parallel groups
  requiresAcknowledgment: boolean;
  clarificationNeeded?: {
    question: string;
    options?: string[];
  };
}

// Fast actions that don't need acknowledgment
const FAST_ACTIONS = ['get_time', 'get_date', 'get_weather', 'simple_math'];
```

#### Interface

```typescript
interface ClaudeClient {
  parseIntent(input: string, context?: ConversationContext): Promise<IntentParseResult>;
}

interface ConversationContext {
  recentIntents?: Array<{
    intent: ParsedIntent;
    result: unknown;
    timestamp: number;
  }>;
}

class IntentParser {
  constructor(claude: ClaudeClient);
  parseInput(input: string, context?: ConversationContext): Promise<IntentParseResult>;
}
```

#### Acknowledgment Logic (Hardcoded)

```typescript
private shouldAcknowledge(parsed: IntentParseResult): boolean {
  // Clarification = no ack (we ask the question instead)
  if (parsed.clarificationNeeded) return false;

  // No intents = nothing to ack
  if (parsed.intents.length === 0) return false;

  // Multiple intents = always ack (complex)
  if (parsed.intents.length > 1) return true;

  // Single fast action = no ack (result comes quickly)
  const action = parsed.intents[0].action;
  return !FAST_ACTIONS.includes(action);
}
```

#### Test Cases

1. **Single intent**: Parses simple query correctly
2. **Compound intent**: Parses multiple actions with dependencies
3. **Parallel execution**: Identifies independent intents
4. **Clarification**: Returns clarification when ambiguous
5. **Fast action ack**: `get_time` → no acknowledgment
6. **Slow action ack**: `research` → acknowledgment
7. **Multiple intents ack**: Always requires acknowledgment
8. **Context handling**: Passes context to Claude for follow-ups
9. **Error handling**: Throws on API error
10. **Empty input**: Returns clarification request

---

### Component 6: Modality Engine (`src/ui/modalityEngine.ts`)

Decides how to present output - voice, document, or both.

#### Design Decisions

- **Content type determines modality**: Simple → voice, complex → voice + doc
- **Document locations are context-dependent**: Code → project, data → Downloads
- **Auto-open for important docs**: Research opens automatically, logs don't

#### Types

```typescript
interface ModalityDecision {
  voice: boolean;
  document: boolean;
  documentType?: 'markdown' | 'code' | 'data';
  documentLocation?: string;
  autoOpen: boolean;
  highlights?: string;  // Key points for voice summary
}

type ContentType =
  | 'simple_answer'   // Weather, time, yes/no
  | 'complex_result'  // Research, analysis
  | 'code'            // Generated code
  | 'data'            // Exports, logs
  | 'error';          // Errors needing decision
```

#### Interface

```typescript
interface ModalityContext {
  projectPath?: string;
  isLog?: boolean;
}

class ModalityEngine {
  decide(result: ExecutionResult, contentType: ContentType, context?: ModalityContext): ModalityDecision;
}
```

#### Modality Rules

| Content Type | Voice | Document | Auto-open | Location |
|--------------|-------|----------|-----------|----------|
| simple_answer | ✓ | ✗ | - | - |
| complex_result | ✓ (highlights) | ✓ (markdown) | ✓ | Desktop |
| code | ✓ (brief) | ✓ (code) | ✓ | Project or Desktop |
| data | ✓ (brief) | ✓ (data) | ✓* | Downloads |
| data (log) | ✓ (brief) | ✓ (data) | ✗ | ~/.jack/logs/ |
| error | ✓ | ✗ | - | - |

#### Test Cases

1. **Time query**: Voice only
2. **Weather query**: Voice only
3. **Research**: Voice highlights + document, auto-open
4. **Code generation**: Document + brief voice, auto-open
5. **Data export**: Document to Downloads
6. **Logs**: Document to ~/.jack/logs/, no auto-open
7. **Errors**: Voice only
8. **Project path**: Code goes to project folder

---

### Component 7: Orchestrator (`src/ui/orchestrator.ts`)

Main coordination point - routes requests and manages flow.

#### Design Decisions

- **Single entry point**: All user input goes through `handle()`
- **Task tracking**: Maintains state per client
- **Interruption support**: Can stop running tasks
- **Callbacks for output**: Decoupled from transport layer

#### Interface

```typescript
interface OrchestratorCallbacks {
  onAck: (text: string) => void;
  onSpeech: (text: string) => void;
  onDocument: (path: string, type: string) => void;
  onClarify: (question: string, options?: string[]) => void;
  onError: (code: string, message: string) => void;
}

interface ActionExecutor {
  execute(intent: ParsedIntent): Promise<ExecutionResult>;
}

class Orchestrator {
  constructor(parser: IntentParser, modalityEngine: ModalityEngine, executor: ActionExecutor);

  handle(input: UserInput, callbacks: OrchestratorCallbacks): Promise<void>;
  interrupt(clientId: string): void;
  getTaskStatus(clientId: string): TaskStatus | null;
}
```

#### Flow

```
User Input
    │
    ▼
┌─────────────────┐
│  Parse Intents  │ ← IntentParser
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Clarify?   Execute
    │         │
    ▼         ▼
┌────────┐  ┌─────────────────┐
│ onClar │  │ Send Ack (slow) │
└────────┘  └────────┬────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Execute Intents│ ← ActionExecutor
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │ Decide Modality│ ← ModalityEngine
            └────────┬───────┘
                     │
              ┌──────┴──────┐
              │             │
              ▼             ▼
        ┌──────────┐  ┌───────────┐
        │ onSpeech │  │ onDocument│
        └──────────┘  └───────────┘
```

#### Execution Order

Intents are grouped by dependencies:
- Groups run sequentially (group 1 → group 2 → ...)
- Intents within a group run in parallel

```typescript
executionOrder: [['i1', 'i2'], ['i3']]
// i1 and i2 run in parallel
// i3 runs after both complete
```

#### Test Cases

1. **Simple input**: Process and return result
2. **Slow action**: Send acknowledgment first
3. **Clarification**: Send clarify callback, no execution
4. **Document output**: Call onDocument callback
5. **Execution error**: Call onError callback
6. **Interrupt**: Stop running task, mark as interrupted
7. **Task status**: Track and return status
8. **Unknown client**: Return null for status

---

## Running Tests

```bash
# Run all tests (101 tests)
bun test

# Run specific phase
bun test tests/unit/ui/
bun test tests/unit/capabilities/

# Watch mode
bun test --watch
```

---

## Phase 3: Capability Layer

### Component 8: Context Manager (`src/capabilities/contextManager.ts`)

Three-tier context system for conversation state and memory.

#### Design Decisions

- **Three tiers**: Short-term (recent turns), Session (active resource), Long-term (persisted)
- **No NLP on retrieval**: Direct key-value lookup for speed
- **SQLite for persistence**: Survives restarts, no external DB needed
- **Namespaced keys**: `user.*`, `preference.*`, `project.*`, `person.*`, `tool.*`

#### Types

```typescript
// Short-term: recent conversation turns
interface RecentIntent {
  intent: ParsedIntent;
  result: unknown;
  timestamp: number;
}

// Session: active resource being worked on
interface ActiveResource {
  type: 'file' | 'project' | 'url' | 'conversation';
  path?: string;
  metadata?: Record<string, unknown>;
  activatedAt: number;
}

// Long-term: namespaced key-value pairs
type MemoryValue = string | number | boolean | null;

// Combined snapshot for Intent Parser
interface ContextSnapshot {
  recentIntents: RecentIntent[];
  activeResource: ActiveResource | null;
  relevantMemory: Record<string, MemoryValue>;
}
```

#### Interface

```typescript
interface ContextManagerConfig {
  dbPath: string;  // SQLite database path
}

class ContextManager {
  constructor(config: ContextManagerConfig);

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Short-term (3 intents, 60s expiry)
  recordIntent(clientId: string, intent: ParsedIntent, result: unknown): void;
  getRecentIntents(clientId: string): RecentIntent[];
  clearRecentIntents(clientId: string): void;

  // Session (until disconnect)
  setActiveResource(clientId: string, resource: ActiveResource): void;
  getActiveResource(clientId: string): ActiveResource | null;
  clearActiveResource(clientId: string): void;

  // Long-term (SQLite)
  memory: Memory;

  // Combined
  getSnapshot(clientId: string, namespaces: string[]): Promise<ContextSnapshot>;
  clearClient(clientId: string): void;  // Clears short-term + session, NOT memory
}

class Memory {
  get(key: string): Promise<MemoryValue>;
  set(key: string, value: MemoryValue): Promise<void>;
  delete(key: string): Promise<void>;
  getNamespace(prefix: string): Promise<Record<string, MemoryValue>>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}
```

#### Memory Namespaces

| Namespace | Purpose | Example Keys |
|-----------|---------|--------------|
| `user.*` | About the user | `user.name`, `user.email` |
| `preference.*` | UI/behavior settings | `preference.voice.speed`, `preference.darkMode` |
| `project.*` | Project-specific context | `project.myapp.path`, `project.myapp.language` |
| `person.*` | People mentioned | `person.sarah.role`, `person.sarah.email` |
| `tool.*` | Generated tool metadata | `tool.csvParser.lastUsed` |

#### Test Cases

**Short-term:**
1. Records and retrieves recent intents
2. Returns empty array for unknown client
3. Limits to 3 most recent intents
4. Expires intents older than 60 seconds
5. Separates intents by client
6. Clears intents for a client

**Session:**
7. Sets and gets active resource
8. Returns null for no active resource
9. Clears active resource
10. Separates resources by client
11. Replaces existing active resource

**Long-term:**
12. Sets and gets string value
13. Sets and gets number value
14. Sets and gets boolean value
15. Returns null for non-existent key
16. Overwrites existing value
17. Deletes value
18. Gets all keys in namespace
19. Returns empty object for empty namespace
20. Persists across manager instances
21. Lists all keys
22. Clears all memory

**Combined:**
23. Returns combined context snapshot
24. Returns empty snapshot for new client
25. Clears all client data on disconnect (keeps memory)

---

## Next Components to Implement

### Phase 3: Capability Layer (continued)
- Action Executor (parallel/sequential execution)
- Plugin Registry + built-in plugins
- File Finder (smart file location)

### Phase 4: Speech & Sandbox
- Speech Service (Piper TTS, separate process)
- Sandbox Executor (V8 isolates)

See `JACK_V2_ARCHITECTURE.md` for full design details.
