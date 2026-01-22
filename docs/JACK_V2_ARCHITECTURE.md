# JACK v2 Architecture

**JACK is a UI** - a real-time voice and document interface to capabilities.

Not an assistant. Not a chatbot. An interface.

---

## Core Concept: JACK as UI Layer

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                USER                                       │
│                         (Voice / Text / Gesture)                          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                          JACK UI LAYER                                   │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │                     INPUT PROCESSING                           │     │
│   │                                                                │     │
│   │  Voice Recognition ──► Intent Parser ──► Request Formation    │     │
│   │                                                                │     │
│   └────────────────────────────────────────────────────────────────┘     │
│                                     │                                    │
│                                     ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │                    OUTPUT MODALITY ENGINE                      │     │
│   │                                                                │     │
│   │  Decides: Voice only? Voice + Doc? Doc only? Auto-open?       │     │
│   │                                                                │     │
│   │  • Simple answer → Voice                                       │     │
│   │  • Complex result → Highlights (voice) + Full Document         │     │
│   │  • Code/Data → Write to file, announce location                │     │
│   │                                                                │     │
│   └────────────────────────────────────────────────────────────────┘     │
│                                     │                                    │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│   │  SPEECH OUTPUT  │    │  DOCUMENT GEN   │    │   FILE OUTPUT   │     │
│   │  (Piper TTS)    │    │  (Markdown)     │    │  (Save + Open)  │     │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Requests capabilities
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                       CAPABILITY LAYER                                   │
│                        (Swappable)                                       │
│                                                                          │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐   │
│   │    PLUGINS    │  │    SANDBOX    │  │      EXTERNAL APIs        │   │
│   │               │  │               │  │                           │   │
│   │ • Weather     │  │ • Code gen    │  │ • Claude (Anthropic)      │   │
│   │ • News        │  │ • Safe exec   │  │ • Weather API             │   │
│   │ • Search      │  │ • Tool store  │  │ • Search API              │   │
│   │ • Reminders   │  │               │  │                           │   │
│   └───────────────┘  └───────────────┘  └───────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

The separation is clean:
- **UI Layer (JACK)**: How you interact - voice in, voice/documents out
- **Capability Layer**: What it can do - plugins, sandbox, APIs

Capabilities are swappable. The UI is the constant.

---

## Design Principles

1. **UI first** - JACK is an interface, not a personality
2. **Right output for the job** - Voice for quick facts, documents for complex results
3. **Test-Driven Development** - Tests before implementation
4. **Real-time** - Speech never blocks processing
5. **Smart file finding** - Search common locations if file not at expected path
6. **Silent work** - Long tasks work quietly, speak only on crucial updates

---

## Output Modality (The Core UX Decision)

This is what makes JACK an interface, not an assistant. The output modality matches what's actually useful.

### Voice Only (Simple, Immediate)
- Simple facts: weather, time, yes/no answers
- Confirmations: "Done", "Saved", "Sent"
- Errors needing decision: "Build failed, retry?"

### Highlights + Document (Complex Results)
For anything with depth, JACK speaks key takeaways AND creates a full document:

| Task | Voice (Highlights) | Document |
|------|-------------------|----------|
| Research | "Three options. X fastest, Y cheapest, Z most reliable." | Full comparison |
| Code review | "12 issues - 3 critical. Main problem is auth flow." | Issue list with lines |
| Data analysis | "Revenue up 12%, Q3 was turning point." | Charts, tables, data |
| Meeting notes | "Action: proposal by Friday, call Sarah Monday." | Full discussion notes |
| Error investigation | "Memory leak in image processor, started after last deploy." | Traces, logs, timeline |

### Document Only (Code, Exports)
- Generated code → write to file, announce location
- Data exports → save to Downloads
- Logs → save silently to `~/.jack/logs/`

### Output Location (Context-Dependent)

| Content Type | Location |
|--------------|----------|
| Code | Project folder it relates to |
| Research/docs | Desktop |
| Data exports | Downloads |
| Logs/debug | `~/.jack/logs/` |

### Notification Behavior

When JACK creates a document:
1. **Speak briefly**: "Research done" / "Report ready"
2. **Open the file automatically** so you can read immediately

### Future Output Modalities

Voice and documents are the current outputs, but JACK's Modality Engine is designed to extend to:

| Modality | Use Cases |
|----------|-----------|
| **AR Glasses** | Visual overlays, spatial UI, contextual info in field of view |
| **Navigation** | Turn-by-turn directions, map markers, ETA updates |
| **Smart Home** | Device control, status displays, ambient notifications |
| **Wearables** | Haptic feedback, minimal displays, health alerts |
| **Automotive** | Dashboard integration, HUD, parking assistance |

The architecture separates *what* to communicate from *how* to present it. Adding a new output modality means:
1. Adding a new output type to `ModalityDecision`
2. Extending `ModalityEngine.decide()` with rules for when to use it
3. Implementing the output handler (AR renderer, nav system, etc.)

---

## Technology Stack

### Core Runtime: Bun + TypeScript
- 3-4x faster than Node.js
- Native TypeScript (no build step)
- Built-in SQLite
- Native FFI for calling Rust/C

### Data Serialization: MessagePack + JSON Schema
- Binary format, 2-4x faster than JSON
- ~30% smaller payloads
- JSON Schema for contract validation

### Speech: Piper TTS (Native)
- Local neural TTS (~200-500ms latency)
- Non-blocking via separate process

### AI: Anthropic Claude
- Haiku for fast routing (<200ms)
- Sonnet for complex reasoning
- Opus for code generation

### Database: SQLite (Bun native)
- Embedded, zero-config
- Memory, preferences, tool store

---

## System Architecture (Detailed)

```
┌──────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐    │
│  │   Browser   │  │    CLI      │  │   Mobile    │  │    IoT    │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘    │
│         └────────────────┴────────────────┴───────────────┘          │
│                                   │                                  │
│                          WebSocket + MessagePack                     │
└───────────────────────────────────┼──────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        JACK CORE (Bun/TypeScript)                     │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                         EVENT BUS                               │  │
│  │              Simple pub/sub for component communication          │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ╔═══════════════════════════════════════════════════════════════╗   │
│  ║                      UI LAYER                                  ║   │
│  ║  ┌───────────────┐  ┌───────────────┐  ┌────────────────────┐  ║   │
│  ║  │ INTENT PARSER │  │   MODALITY    │  │   ORCHESTRATOR     │  ║   │
│  ║  │               │  │    ENGINE     │  │                    │  ║   │
│  ║  │ • Compound    │  │               │  │ • Route requests   │  ║   │
│  ║  │   detection   │  │ • Voice?      │  │ • Manage responses │  ║   │
│  ║  │ • Follow-ups  │  │ • Document?   │  │ • Format output    │  ║   │
│  ║  │ • Deps graph  │  │ • Both?       │  │                    │  ║   │
│  ║  └───────────────┘  └───────────────┘  └────────────────────┘  ║   │
│  ╚═══════════════════════════════════════════════════════════════╝   │
│                                                                       │
│  ╔═══════════════════════════════════════════════════════════════╗   │
│  ║                   CAPABILITY LAYER                             ║   │
│  ║  ┌───────────────┐  ┌───────────────┐  ┌────────────────────┐  ║   │
│  ║  │    ACTION     │  │    PLUGIN     │  │     FILE FINDER    │  ║   │
│  ║  │   EXECUTOR    │  │   REGISTRY    │  │                    │  ║   │
│  ║  │               │  │               │  │ • Smart search     │  ║   │
│  ║  │ • Parallel    │  │ • Weather     │  │ • Common locations │  ║   │
│  ║  │ • Sequential  │  │ • News        │  │ • Fuzzy match      │  ║   │
│  ║  │ • Progress    │  │ • Search      │  │ • Cache paths      │  ║   │
│  ║  └───────────────┘  └───────────────┘  └────────────────────┘  ║   │
│  ║                                                                ║   │
│  ║  ┌───────────────┐  ┌─────────────────────────────────────────┐║   │
│  ║  │    CONTEXT    │  │           SANDBOX EXECUTOR              │║   │
│  ║  │    MANAGER    │  │                                         │║   │
│  ║  │               │  │ • Code generation (Claude)              │║   │
│  ║  │ • Time        │  │ • V8 isolate execution                  │║   │
│  ║  │ • Weather     │  │ • Network + file access (controlled)    │║   │
│  ║  │ • Location    │  │ • Tool persistence                      │║   │
│  ║  └───────────────┘  └─────────────────────────────────────────┘║   │
│  ╚═══════════════════════════════════════════════════════════════╝   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────┐            ┌─────────────────────────────┐
│  SPEECH SERVICE │            │      EXTERNAL APIS          │
│  (Separate Proc)│            │                             │
│                 │            │ • Claude (Anthropic)        │
│ • Piper TTS     │            │ • Weather (OpenWeatherMap)  │
│ • Non-blocking  │            │ • News (RSS)                │
│ • Queue mgmt    │            │ • Search (Google)           │
│ • Interruption  │            │                             │
└─────────────────┘            └─────────────────────────────┘
```

---

## UI Layer Components

### 1. Intent Parser

Understands what the user wants. Claude (Haiku) handles the NLP, hardcoded rules handle behavior decisions.

```typescript
interface ParsedIntent {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  dependencies: string[];  // Intent IDs this depends on
  conditional?: boolean;   // Only execute if dependency result allows
}

interface IntentParseResult {
  intents: ParsedIntent[];
  executionOrder: string[][];  // Parallel groups
}

// Hardcoded acknowledgment logic - no AI needed
const FAST_ACTIONS = ['get_time', 'get_weather', 'get_date', 'simple_math'];

function shouldAcknowledge(result: IntentParseResult): boolean {
  if (result.intents.length > 1) return true;
  if (!FAST_ACTIONS.includes(result.intents[0].action)) return true;
  return false;
}
```

**How it works:**
1. Claude parses natural language → structured intents (one API call)
2. Hardcoded rules decide acknowledgment, ordering, etc. (no API call)
3. Context Manager provides conversation history for follow-ups

**Capabilities:**
- Compound detection: "Get weather and tell me if I need umbrella"
- Dependency extraction: Intent B depends on Intent A's result
- Follow-up recognition: Uses context from Context Manager
- Clarification generation: Ask user when ambiguous

### 2. Modality Engine

Decides how to present output:

```typescript
interface ModalityDecision {
  voice: boolean;
  document: boolean;
  documentType: 'markdown' | 'code' | 'data';
  documentLocation: string;  // Where to save
  autoOpen: boolean;
  highlights?: string;  // Key points for voice
}

interface ModalityEngine {
  decide(result: ExecutionResult, context: ContextSnapshot): ModalityDecision;
}
```

**Rules:**
- Simple answer (<30 seconds to say) → Voice only
- Complex result → Voice highlights + Document
- Code/data output → Document only

### 3. Orchestrator

Routes requests and manages the overall flow:

```typescript
interface Orchestrator {
  handle(input: UserInput): Promise<void>;
  getTaskStatus(taskId: string): TaskStatus;
  interrupt(taskId: string): void;
}
```

---

## Capability Layer Components

### 4. Action Executor

Executes intents with proper sequencing. Handles parallel/sequential execution, conditionals, and error propagation.

```typescript
interface ActionExecutor {
  execute(
    intents: ParsedIntent[],
    context: ContextSnapshot,
    onProgress?: (intentId: string, status: ProgressStatus) => void
  ): Promise<ExecutionResult[]>;
}

type ProgressStatus =
  | { type: 'started' }
  | { type: 'progress', message: string }
  | { type: 'completed', result: unknown }
  | { type: 'failed', error: string }
  | { type: 'skipped', reason: string };
```

**Execution flow:**
1. Group intents by dependency order (independent ones run in parallel)
2. For each group, run all intents with `Promise.all`
3. Store results for dependent intents to reference
4. For conditional intents, evaluate condition against prior results

**Conditional logic:**
```typescript
// Parser outputs: { action: 'set_reminder', conditional: true, conditionExpr: 'weather.isRainy' }
// Executor evaluates conditionExpr against prior results
function shouldExecute(intent: ParsedIntent, priorResults: Map<string, Result>): boolean {
  if (!intent.conditional) return true;
  return evaluateCondition(intent.conditionExpr, priorResults);
}
```

**Error handling:**
- If intent fails and has dependents → skip dependents, notify user
- If intent fails with no dependents → report error, continue others

### 5. Plugin Registry

Manages available plugins:

```typescript
interface Plugin {
  name: string;
  actions: string[];  // Actions this plugin handles
  execute(action: string, params: Record<string, unknown>): Promise<PluginResult>;
}

interface PluginRegistry {
  register(plugin: Plugin): void;
  find(action: string): Plugin | null;
  list(): Plugin[];
}
```

**Core plugins (built-in):**

| Plugin | Actions | Notes |
|--------|---------|-------|
| **Search** | `web_search` | Google Custom Search + Haiku summarization. Used by user AND internally by JACK when solving problems |
| **Weather** | `get_weather` | OpenWeatherMap API |
| **Time** | `get_time`, `get_date` | Local time, timezone-aware |
| **Reminders** | `create_reminder`, `list_reminders` | SQLite-backed |
| **Memory** | `remember`, `recall`, `forget` | Interface to Context Manager's long-term memory |

**Search plugin** is special - it's a core capability JACK uses internally:
```
User: "Help me fix this React error"
  → JACK doesn't know answer
  → JACK calls SearchPlugin.execute('web_search', { query: 'React error fix' })
  → JACK synthesizes answer from results + own knowledge
```

### 6. Context Manager

Three-tier context system:

```typescript
interface ContextManager {
  // Short-term: recent intents (3 turns or 60 seconds)
  getRecentIntents(clientId: string): RecentIntent[];
  recordIntent(clientId: string, intent: Intent, result: Result): void;

  // Session: active resources (until disconnect)
  getActiveResource(clientId: string): Resource | null;
  setActiveResource(clientId: string, resource: Resource): void;

  // Long-term: persisted key-value memory (SQLite)
  memory: Memory;
}

interface Memory {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  getNamespace(prefix: string): Record<string, unknown>;
}
```

**Long-term memory** uses namespaced key-value pairs (no NLP needed at read time):

```
~/.jack/memory.json
{
  "user.name": "Jack",
  "user.temperatureUnit": "celsius",
  "preference.voice.speed": 1.2,
  "project.myapp.path": "~/code/myapp",
  "tool.csvParser.lastUsed": 1705123456789
}
```

**Namespaces:**
- `user.*` - About the user
- `preference.*` - UI/behavior preferences
- `project.*` - Project-specific context
- `person.*` - People the user mentions
- `tool.*` - Generated tools metadata

Intent Parser detects preference-setting phrases, extracts key-value, stores directly. No NLP on retrieval.

### 7. Sandbox Executor

Dynamic code generation and safe execution. When no plugin handles an action, generate code on the fly.

```typescript
interface SandboxExecutor {
  generate(description: string, context: SandboxContext): Promise<GeneratedTool>;
  execute(tool: GeneratedTool, params: Record<string, unknown>): Promise<SandboxResult>;
  terminate(executionId: string): void;  // Instant kill switch

  // Tool persistence
  saveTool(tool: GeneratedTool): Promise<void>;
  loadTool(name: string): Promise<GeneratedTool | null>;
}

interface SandboxContext {
  fetch: (url: string) => Promise<Response>;  // No whitelist, but logged
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  params: Record<string, unknown>;
}
```

**Safety model - trust isolation, control resources:**
- V8 isolate (via `isolated-vm`) - code can't escape sandbox
- Hard limits: 30s timeout, 128MB memory
- File access restricted to allowed directories
- Network: no whitelist, but all requests logged
- Kill switch: `isolate.dispose()` terminates immediately

**Monitoring triggers kill:**
- CPU spike / runaway loop
- Suspicious network patterns
- User says "stop" / "cancel"

**Tool persistence:**
```typescript
// ~/.jack/tools/csv-parser.js
interface PersistedTool {
  name: string;
  description: string;
  code: string;
  inputSchema: object;  // JSON Schema
  createdAt: number;
  lastUsed: number;
  useCount: number;
}
```
```

### 8. File Finder

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

## Infrastructure Components

### 9. Event Bus

Simple pub/sub for component communication. No priority lanes needed - speech runs in a separate process, and the acknowledgment decision happens in the Intent Parser before any events are emitted.

```typescript
interface EventBus {
  emit<T>(type: string, payload: T): void;
  on<T>(type: string, handler: (payload: T) => void): () => void;
  once<T>(type: string, handler: (payload: T) => void): () => void;
}
```

The key insight: priority lanes were trying to solve "speech shouldn't wait for slow work." But:
1. Speech runs in a separate process (already non-blocking)
2. The simple-vs-complex decision happens in Intent Parser, before execution
3. By the time events hit the bus, we already know what to do

So the EventBus is just a decoupling mechanism - components don't call each other directly.

### 10. Protocol Codec (MessagePack)

```typescript
interface Message {
  id: string;           // UUID
  type: MessageType;    // Enum
  timestamp: number;    // Unix ms
  payload: unknown;     // Type-specific
}

interface Codec {
  encode(message: Message): Uint8Array;
  decode(bytes: Uint8Array): Message;
  validate(message: Message, schema: Schema): boolean;
}
```

### 11. Speech Service (Separate Process)

Non-blocking voice output. Runs in separate process so it never blocks main work.

```typescript
interface SpeechService {
  speak(clientId: string, text: string): void;  // Fire-and-forget
  interrupt(clientId: string): void;            // Hard cut, immediate
  isSpeaking(clientId: string): boolean;
}

// Message sent to client (text + audio paired)
interface SpeechMessage {
  text: string;
  audio: Uint8Array;  // Full WAV, not streamed
}
```

**Design decisions:**
- **Single voice** - One Piper voice for JACK (configurable in preferences)
- **Full WAV generation** - Not streamed. Text and audio always paired in one message
- **Hard cut interruption** - When user speaks, JACK stops immediately
- **Separate process** - Uses Bun worker or subprocess, never blocks main event loop

**Flow:**
1. Main process sends text to speech process (fire-and-forget)
2. Speech process generates WAV with Piper (~200-500ms)
3. Speech process sends `{ text, audio }` to client via WebSocket
4. Client plays audio, optionally displays text

### 12. WebSocket Server & Protocol

#### Connection

```
ws://localhost:3000

Client connects → sends 'connect' → receives 'connected'
```

#### Message Envelope (MessagePack encoded)

```typescript
interface Message {
  id: string;        // UUID for request/response correlation
  type: string;      // Message type
  ts: number;        // Unix timestamp ms
  payload: unknown;  // Type-specific data
}
```

#### Client Identification (Persistent)

Clients have persistent IDs that survive reconnection:

```typescript
// Client sends on connect
interface ConnectPayload {
  clientId?: string;           // Existing ID (omit if new client)
  clientType: 'cli' | 'web' | 'mobile';
  version: string;
}

// Server responds
interface ConnectedPayload {
  clientId: string;            // Confirmed or newly assigned
  isReconnect: boolean;        // true if existing client restored
}
```

Client stores ID locally (localStorage for web, config file for CLI). On reconnect, session context is restored.

#### Client → Server Messages

| Type | Payload | Description |
|------|---------|-------------|
| `connect` | `{ clientId?, clientType, version }` | Initial connection |
| `input` | `{ text: string }` | User voice/text input |
| `interrupt` | `{}` | Stop speaking, cancel current task |
| `task_status` | `{ taskId: string }` | Request status of background task |
| `context_update` | `{ type: string, data: unknown }` | Client-side context (location, etc.) |

#### Server → Client Messages

| Type | Payload | Description |
|------|---------|-------------|
| `connected` | `{ clientId, isReconnect }` | Connection established |
| `ack` | `{ text: string, audio: Uint8Array }` | Brief acknowledgment ("On it.") |
| `speech` | `{ text: string, audio: Uint8Array }` | Voice response |
| `document` | `{ path: string, type: string }` | Document created, auto-open |
| `progress` | `{ taskId, status, message? }` | Background task update |
| `error` | `{ code: string, message: string }` | Error occurred |
| `clarify` | `{ question: string, options?: string[] }` | JACK needs clarification |

#### Example Flows

**Simple query:**
```
→ { type: 'input', payload: { text: 'What time is it?' } }
← { type: 'speech', payload: { text: '3:45', audio: <bytes> } }
```

**Complex query:**
```
→ { type: 'input', payload: { text: 'Research database options' } }
← { type: 'ack', payload: { text: 'On it.', audio: <bytes> } }
  ... work happens ...
← { type: 'speech', payload: { text: 'Three options...', audio: <bytes> } }
← { type: 'document', payload: { path: '~/Desktop/db-comparison.md', type: 'markdown' } }
```

**Interruption:**
```
→ { type: 'input', payload: { text: 'Research...' } }
← { type: 'ack', payload: { text: 'On it.', audio: <bytes> } }
→ { type: 'interrupt', payload: {} }
← { type: 'speech', payload: { text: 'Stopped.', audio: <bytes> } }
```

**Clarification:**
```
→ { type: 'input', payload: { text: 'Open the report' } }
← { type: 'clarify', payload: { question: 'Which report?', options: ['sales-q3.xlsx', 'annual-report.pdf'] } }
→ { type: 'input', payload: { text: 'The sales one' } }
← { type: 'speech', payload: { text: 'Opening.', audio: <bytes> } }
```

---

## Data Flow Examples

### Simple Query: "What's the weather?"

```
User: "What's the weather?"
  │
  ├─> IntentParser.parse() → Single intent, simple
  │     └─> requiresAcknowledgment: false
  │
  ├─> ActionExecutor.execute()
  │     └─> WeatherPlugin.get() → {temp: 72, conditions: "sunny"}
  │
  ├─> ModalityEngine.decide() → Voice only
  │
  └─> SpeechService.speak("72 and sunny")
      └─> Response in <500ms, no acknowledgment
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
  ├─> ModalityEngine.decide() → Voice only (simple confirmation)
  │
  └─> SpeechService.speak("Rain expected. Reminder set for 8am.")
```

### Complex Research: "Research database options for my project"

```
User: "Research database options for my project"
  │
  ├─> IntentParser.parse() → Research intent
  │     └─> requiresAcknowledgment: true
  │
  ├─> SpeechService.speak("On it.")
  │
  ├─> ActionExecutor.execute()
  │     └─> Claude research → {options: [...], comparison: {...}}
  │
  ├─> ModalityEngine.decide() → Voice highlights + Document
  │     └─> highlights: "Three options. PostgreSQL for reliability..."
  │     └─> document: ~/Desktop/database-comparison.md
  │
  ├─> DocumentGenerator.create()
  │     └─> Write full comparison to file
  │
  ├─> SpeechService.speak(highlights + "Full comparison opening.")
  │
  └─> FileSystem.open(document)
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
  ├─> ModalityEngine.decide() → Voice highlights + Document
  │
  └─> SpeechService.speak("Total sales $1.2M, top product...")
      + Open sales-analysis.md
```

---

## Long-Running Task Behavior

JACK handles long tasks silently:

- **No unsolicited updates** - Works quietly in background
- **Crucial updates only** - Speaks when something important happens (error, needs input)
- **Available on request** - User can ask "How's that task going?" anytime
- **Completion** - Brief announcement + open result if it's a document

If something goes wrong:
```
JACK: "I hit a snag - the sales file from March is missing. Skip it or wait?"
```

---

## Directory Structure

```
JACK/
├── src/
│   ├── ui/                      # UI Layer
│   │   ├── intentParser.ts      # Intent parsing
│   │   ├── modalityEngine.ts    # Output modality decisions
│   │   ├── orchestrator.ts      # Request orchestration
│   │   └── documentGenerator.ts # Document creation
│   ├── capabilities/            # Capability Layer
│   │   ├── executor/
│   │   │   ├── actionExecutor.ts
│   │   │   └── types.ts
│   │   ├── sandbox/
│   │   │   ├── executor.ts
│   │   │   ├── generator.ts
│   │   │   ├── validator.ts
│   │   │   └── toolStore.ts
│   │   ├── plugins/
│   │   │   ├── registry.ts
│   │   │   ├── weather.ts
│   │   │   ├── news.ts
│   │   │   └── search.ts
│   │   ├── context/
│   │   │   ├── manager.ts
│   │   │   └── providers/
│   │   └── files/
│   │       ├── finder.ts
│   │       └── cache.ts
│   ├── infrastructure/          # Infrastructure
│   │   ├── eventBus.ts
│   │   ├── speech/
│   │   │   ├── service.ts
│   │   │   ├── worker.ts
│   │   │   └── piper.ts
│   │   ├── server/
│   │   │   ├── index.ts
│   │   │   └── handlers.ts
│   │   └── protocol/
│   │       ├── codec.ts
│   │       ├── schemas/
│   │       └── types.ts
│   └── types/
│       └── index.ts
├── tests/
│   ├── unit/
│   │   ├── ui/
│   │   ├── capabilities/
│   │   └── infrastructure/
│   └── integration/
├── schemas/
├── docs/
└── package.json
```

---

## Implementation Phases

### Phase 1: Foundation
1. Bun project setup with TypeScript
2. MessagePack codec with JSON Schema validation
3. EventBus (simple pub/sub)
4. Basic WebSocket server

### Phase 2: UI Layer
5. Intent Parser (Claude Haiku)
6. Modality Engine (output decisions)
7. Orchestrator (request routing)

### Phase 3: Capability Layer
8. Action Executor
9. Context Manager with providers
10. Plugin Registry + built-in plugins
11. File Finder

### Phase 4: Speech & Sandbox
12. Speech Service (separate process, Piper)
13. Sandbox Executor (V8 isolates)
14. Code generator (Claude)
15. Document generator

### Phase 5: Integration
16. Wire all components
17. End-to-end testing
18. CLI client
19. Web client

---

## Testing Strategy

**TDD: Tests before implementation**

```
tests/
├── unit/
│   ├── ui/
│   │   ├── intentParser.test.ts      # Compound detection, deps
│   │   ├── modalityEngine.test.ts    # Output decisions
│   │   └── orchestrator.test.ts
│   ├── capabilities/
│   │   ├── executor.test.ts          # Parallel/sequential
│   │   ├── sandbox.test.ts           # Safe execution
│   │   ├── plugins.test.ts
│   │   └── fileFinder.test.ts
│   └── infrastructure/
│       ├── eventBus.test.ts          # Pub/sub behavior
│       ├── speech.test.ts            # Non-blocking
│       └── codec.test.ts             # MessagePack
└── integration/
    ├── simple-query.test.ts
    ├── compound-query.test.ts
    ├── research-with-doc.test.ts
    └── sandbox-tool.test.ts
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

1. **Sandbox isolation** - V8 isolates via `isolated-vm`, no access to Node/Bun APIs
2. **Instant termination** - Kill switch for runaway or suspicious code
3. **Resource limits** - 30s timeout, 128MB memory per execution
4. **File path restrictions** - Sandbox can only access designated directories
5. **Network logging** - All sandbox HTTP requests logged for review
6. **Rate limiting** - Prevent abuse of AI APIs
7. **Input validation** - JSON Schema at all boundaries
