# JACK v2 Architecture

A real-time, voice-first AI assistant with intelligent intent parsing and dynamic capability generation.

## Design Principles

1. **Test-Driven Development** - Tests before implementation
2. **Real-time first** - Speech never blocks, instant acknowledgments for complex queries only
3. **Smart file finding** - Search common locations if file not at expected path
4. **Silent work** - Long tasks work quietly, speak only on crucial updates or completion
5. **Hybrid architecture** - Right tool for each job

---

## Technology Stack

### Core Runtime: **Bun + TypeScript**
- 3-4x faster than Node.js
- Native TypeScript (no build step)
- Built-in SQLite
- Native FFI for calling Rust/C
- Drop-in Node.js compatible

### Data Serialization: **MessagePack + JSON Schema**
- Binary format, 2-4x faster than JSON
- ~30% smaller payloads
- JSON Schema for contract validation at boundaries
- Easy debugging (decodes to JSON)

### Speech: **Piper TTS (Native)**
- Local neural TTS (~200-500ms latency)
- Called via subprocess or FFI
- Non-blocking via worker/separate process

### AI: **Anthropic Claude**
- Haiku for fast routing (<200ms)
- Sonnet for complex reasoning
- Opus for code generation in sandbox

### Database: **SQLite (Bun native)**
- Embedded, zero-config
- Fast for local data
- Memory, preferences, tool store

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Browser   │  │    CLI      │  │   Mobile    │  │    IoT    │  │
│  │  (Web App)  │  │  (Terminal) │  │   (Future)  │  │  (Future) │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │
│         │                │                │               │         │
│         └────────────────┴────────────────┴───────────────┘         │
│                                   │                                  │
│                          WebSocket + MessagePack                     │
│                                   │                                  │
└───────────────────────────────────┼──────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        JACK CORE (Bun/TypeScript)                     │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    EVENT BUS (Priority Lanes)                   │  │
│  │   URGENT (Speech)  │  HIGH (Input)  │  NORMAL  │  LOW (Cleanup) │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │ INTENT PARSER │  │    CONTEXT    │  │      ORCHESTRATOR         │ │
│  │               │  │    MANAGER    │  │                           │ │
│  │ • Compound    │  │               │  │ • Route to components     │ │
│  │   detection   │  │ • Time        │  │ • Manage execution flow   │ │
│  │ • Follow-ups  │  │ • Weather     │  │ • Handle responses        │ │
│  │ • Deps graph  │  │ • Location    │  │ • Background task mgmt    │ │
│  │ • Clarify     │  │ • Preferences │  │                           │ │
│  └───────────────┘  └───────────────┘  └───────────────────────────┘ │
│                                                                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │    ACTION     │  │    PLUGIN     │  │       FILE FINDER         │ │
│  │   EXECUTOR    │  │   REGISTRY    │  │                           │ │
│  │               │  │               │  │ • Smart search            │ │
│  │ • Parallel    │  │ • Weather     │  │ • Common locations        │ │
│  │ • Sequential  │  │ • News        │  │ • Fuzzy match             │ │
│  │ • Progress    │  │ • Search      │  │ • Cache found paths       │ │
│  │ • Fallback    │  │ • Memory      │  │                           │ │
│  └───────────────┘  └───────────────┘  └───────────────────────────┘ │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐
│  SPEECH SERVICE │  │ SANDBOX EXECUTOR│  │      EXTERNAL APIS          │
│  (Separate Proc)│  │  (V8 Isolate)   │  │                             │
│                 │  │                 │  │ • Claude (Anthropic)        │
│ • Piper TTS     │  │ • Code gen      │  │ • Weather (OpenWeatherMap)  │
│ • Non-blocking  │  │ • Safe exec     │  │ • News (RSS)                │
│ • Queue mgmt    │  │ • Network+File  │  │ • Search (Google)           │
│ • Interruption  │  │ • Tool persist  │  │ • Wolfram Alpha             │
│                 │  │                 │  │                             │
└─────────────────┘  └─────────────────┘  └─────────────────────────────┘
```

---

## Component Details

### 1. Event Bus (Priority Lanes)

Non-blocking event processing with parallel lanes:

```typescript
enum EventLane {
  URGENT = 'urgent',   // Speech - immediate, parallel
  HIGH = 'high',       // User input - high priority
  NORMAL = 'normal',   // Background work
  LOW = 'low'          // Cleanup, analytics
}

interface EventBus {
  publish(event: Event, lane?: EventLane): Promise<void>;
  publishFireAndForget(event: Event, lane?: EventLane): void;
  subscribe(types: EventType[], handler: Handler, lane?: EventLane): string;
}
```

### 2. Intent Parser

Semantic understanding of user requests:

```typescript
interface ParsedIntent {
  id: string;
  type: 'query' | 'action' | 'compound' | 'follow_up';
  action: string;
  parameters: Record<string, unknown>;
  confidence: number;
  dependencies: string[];  // Intent IDs this depends on
}

interface IntentParseResult {
  intents: ParsedIntent[];
  isCompound: boolean;
  executionOrder: string[][];  // Parallel groups
  requiresAcknowledgment: boolean;  // Only true for complex/long ops
}
```

### 3. Context Manager

Client-side context providers:

```typescript
interface ContextProvider {
  type: ContextType;
  get(): Promise<ContextValue>;
  isStale(): boolean;
  refresh(): Promise<ContextValue>;
}

enum ContextType {
  TIME = 'time',
  WEATHER = 'weather',
  LOCATION = 'location',
  USER_PREFERENCES = 'user_preferences',
  ACTIVE_TASKS = 'active_tasks'
}
```

### 4. Action Executor

Execute intents with proper sequencing:

```typescript
interface ActionExecutor {
  plan(intents: ParsedIntent[], context: ContextSnapshot): ExecutionPlan;
  execute(plan: ExecutionPlan, onProgress?: ProgressCallback): Promise<ExecutionResult[]>;
  canHandle(action: string): boolean;
}
```

### 5. Sandbox Executor

Dynamic code generation and safe execution:

```typescript
interface SandboxExecutor {
  // Generate tool from description
  generateTool(description: string, examples: Example[]): Promise<GeneratedTool>;

  // Execute in isolated V8 context
  execute(code: string, context: SandboxContext): Promise<SandboxResult>;

  // Persist successful tools
  saveTool(tool: GeneratedTool): Promise<void>;

  // Load saved tools
  loadTools(): Promise<GeneratedTool[]>;
}

interface SandboxContext {
  // Controlled capabilities
  http: SafeHttpClient;      // Rate-limited, domain whitelist
  files: SafeFileAccess;     // Restricted paths
  parameters: Record<string, unknown>;
}
```

### 6. Speech Service (Separate Process)

Non-blocking voice output:

```typescript
interface SpeechService {
  // Fire-and-forget - returns immediately
  speak(request: SpeechRequest): void;

  // Only for complex queries, not simple ones
  speakAcknowledgment(clientId: string): void;

  interrupt(clientId: string): void;
  isSpeaking(clientId: string): boolean;
}

interface SpeechRequest {
  text: string;
  priority: 'immediate' | 'normal' | 'background';
  interruptible: boolean;
  clientId: string;
}
```

### 7. File Finder

Smart file location:

```typescript
interface FileFinder {
  find(filename: string, hints?: FileHints): Promise<string | null>;
  findAll(pattern: string): Promise<string[]>;
}

// Search order:
// 1. Exact path given
// 2. Same filename in: Desktop, Documents, Downloads
// 3. Fuzzy match by filename pattern
// 4. Search by extension in known locations
// 5. Ask user if ambiguous or not found
```

---

## Data Flow Examples

### Simple Query: "What's the weather?"

```
User: "What's the weather?"
  │
  ├─> IntentParser.parse() → Single intent, simple
  │     └─> requiresAcknowledgment: false (quick query)
  │
  ├─> ActionExecutor.execute()
  │     └─> WeatherPlugin.get() → {temp: 72, conditions: "sunny"}
  │
  └─> SpeechService.speak("It's 72 and sunny")
      └─> Response in <500ms, no "working on it"
```

### Compound Query: "Get weather and remind me about umbrella if rainy"

```
User: "Get weather and remind me about umbrella if rainy"
  │
  ├─> IntentParser.parse() → 3 intents with dependencies
  │     └─> requiresAcknowledgment: true (complex)
  │
  ├─> SpeechService.speakAcknowledgment("On it.")
  │     └─> Immediate (~200ms), non-blocking
  │
  ├─> ActionExecutor.execute()
  │     ├─> Intent 1: get_weather → {conditions: "rain"}
  │     ├─> Intent 2: analyze (depends on 1) → {needsUmbrella: true}
  │     └─> Intent 3: create_reminder (depends on 2, conditional)
  │
  └─> SpeechService.speak("Rain expected. I've set a reminder...")
```

### Dynamic Tool Generation

```
User: "Parse this CSV file and summarize the sales data"
  │
  ├─> FileFinder.find("sales data") → /Users/.../sales.csv
  │
  ├─> ActionExecutor: No CSV parser tool registered
  │     └─> Fallback to SandboxExecutor
  │
  ├─> SandboxExecutor.generateTool("Parse CSV and summarize sales")
  │     └─> Claude generates code
  │     └─> Validate for security
  │     └─> Execute in V8 isolate
  │     └─> Save tool for reuse
  │
  └─> SpeechService.speak("Total sales: $1.2M, top product...")
```

---

## Message Protocol (MessagePack)

All inter-component messages use MessagePack with JSON Schema validation:

```typescript
// Base message envelope
interface Message {
  id: string;           // UUID
  type: MessageType;    // Enum
  timestamp: number;    // Unix ms
  payload: unknown;     // Type-specific
}

// Client → Server
interface ClientMessage extends Message {
  type: 'user_input' | 'context_update' | 'interrupt' | 'task_status';
}

// Server → Client
interface ServerMessage extends Message {
  type: 'response' | 'speech' | 'progress' | 'error' | 'acknowledgment';
}

// Inter-component (internal)
interface InternalMessage extends Message {
  source: string;       // Component ID
  target: string;       // Component ID or 'broadcast'
  correlationId: string; // For request/response matching
}
```

---

## Directory Structure

```
JACK/
├── src/
│   ├── core/                 # Core orchestration
│   │   ├── eventBus.ts
│   │   ├── orchestrator.ts
│   │   └── config.ts
│   ├── intent/               # Intent parsing
│   │   ├── parser.ts
│   │   ├── analyzer.ts
│   │   └── types.ts
│   ├── context/              # Context management
│   │   ├── manager.ts
│   │   └── providers/
│   │       ├── time.ts
│   │       ├── weather.ts
│   │       └── location.ts
│   ├── executor/             # Action execution
│   │   ├── executor.ts
│   │   ├── planner.ts
│   │   └── types.ts
│   ├── sandbox/              # Code generation & execution
│   │   ├── executor.ts
│   │   ├── generator.ts
│   │   ├── validator.ts
│   │   └── toolStore.ts
│   ├── speech/               # Voice output
│   │   ├── service.ts
│   │   ├── worker.ts
│   │   └── piper.ts
│   ├── files/                # File finding
│   │   ├── finder.ts
│   │   └── cache.ts
│   ├── plugins/              # Built-in plugins
│   │   ├── weather.ts
│   │   ├── news.ts
│   │   ├── search.ts
│   │   └── memory.ts
│   ├── server/               # WebSocket server
│   │   ├── index.ts
│   │   └── handlers.ts
│   ├── protocol/             # MessagePack + Schema
│   │   ├── codec.ts
│   │   ├── schemas/
│   │   └── types.ts
│   └── types/                # Shared types
│       └── index.ts
├── tests/
│   ├── unit/
│   └── integration/
├── schemas/                  # JSON Schemas
│   ├── message.json
│   ├── intent.json
│   └── context.json
├── docs/
│   ├── JACK_V2_ARCHITECTURE.md
│   └── TODO.md
├── package.json              # Bun project
├── bunfig.toml              # Bun config
└── tsconfig.json
```

---

## Implementation Phases

### Phase 1: Foundation
1. Set up Bun project with TypeScript
2. Implement MessagePack codec with JSON Schema validation
3. EventBus with priority lanes
4. Basic WebSocket server

### Phase 2: Core Components
5. Intent Parser (Claude Haiku for fast parsing)
6. Context Manager with time/weather/location providers
7. Action Executor with parallel/sequential support

### Phase 3: Speech & Files
8. Speech Service (separate process, Piper TTS)
9. File Finder with smart search

### Phase 4: Sandbox & Plugins
10. Sandbox Executor (V8 isolates)
11. Code generator (Claude for tool creation)
12. Built-in plugins (weather, news, search, memory)

### Phase 5: Integration
13. Wire all components
14. End-to-end testing
15. CLI client
16. Web client

---

## Testing Strategy

**TDD: Tests before implementation**

```
tests/
├── unit/
│   ├── core/
│   │   ├── eventBus.test.ts      # Lane isolation, parallel processing
│   │   └── orchestrator.test.ts
│   ├── intent/
│   │   ├── parser.test.ts        # Compound detection, deps
│   │   └── analyzer.test.ts
│   ├── context/
│   │   └── manager.test.ts       # Provider management
│   ├── executor/
│   │   └── executor.test.ts      # Parallel/sequential execution
│   ├── sandbox/
│   │   ├── executor.test.ts      # Safe execution
│   │   └── validator.test.ts     # Security checks
│   ├── speech/
│   │   └── service.test.ts       # Non-blocking, queue
│   └── files/
│       └── finder.test.ts        # Smart search
└── integration/
    ├── compound-query.test.ts    # Multi-intent flows
    ├── sandbox-tool.test.ts      # Dynamic tool generation
    └── full-flow.test.ts         # End-to-end
```

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Simple query (weather, time) | <500ms | No acknowledgment |
| Compound query (start) | <200ms | Acknowledgment only |
| Intent parsing | <100ms | Claude Haiku |
| Speech start | <300ms | Piper TTS |
| Plugin execution | <200ms | Cached where possible |
| Sandbox execution | <2s | Code gen + exec |
| WebSocket latency | <10ms | MessagePack |

---

## Security Considerations

1. **Sandbox isolation** - V8 isolates, no access to Node/Bun APIs
2. **Network whitelist** - Generated code can only call approved domains
3. **File path restrictions** - Sandbox can only access designated directories
4. **Rate limiting** - Prevent abuse of AI APIs
5. **Input validation** - JSON Schema at all boundaries
6. **No eval/Function** - Static analysis blocks dangerous patterns

---

## Long-Running Task Behavior

JACK handles long tasks like a partner you've delegated work to:

- **No unsolicited updates** - Works quietly in background
- **Crucial updates only** - Speaks when something important happens (error, needs input, major milestone)
- **Available on request** - User can ask "How's that task going?" anytime
- **Completion notification** - Speaks final result when done

Example:
```
User: "Analyze all the sales data from last quarter"
JACK: "On it." (brief acknowledgment)
      ... works silently for 45 seconds ...
JACK: "Done. Revenue was up 12%, top product was..."
```

If something goes wrong:
```
JACK: "I hit a snag - the sales file from March is missing. Want me to skip it or wait?"
```
