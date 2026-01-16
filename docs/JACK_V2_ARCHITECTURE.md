# JACK v2 Architecture Redesign

## Overview

Redesign JACK from a response-oriented AI assistant to a **real-time voice-first conversational kernel** with intelligent intent parsing, independent speech, and dynamic capability generation.

## Core Problems Being Solved

1. **Not real-time** - TTS blocks on full audio generation, 10-second queue drain delays
2. **No compound command understanding** - Only keyword detection ("and then"), misses semantic compounds
3. **No dynamic capability generation** - Can't create tools on-the-fly for unknown tasks
4. **Speech coupled to processing** - Can't speak "Working on it..." while doing background work

---

## Architecture

```
                    +------------------+
                    |   User Voice/    |
                    |   Text Input     |
                    +--------+---------+
                             |
                             v
+------------------------------------------------------------+
|              EVENT BUS V2 (Priority Lanes)                  |
|  URGENT: Speech    HIGH: User Input    NORMAL: Background   |
+------------------------------------------------------------+
              |              |              |
              v              v              v
    +---------+    +---------+--------+    +----------+
    | SPEECH  |    |  INTENT PARSER   |    | CONTEXT  |
    | SERVICE |    | (Decomposition)  |    | MANAGER  |
    +---------+    +------------------+    +----------+
    | Worker  |    | Compound detect  |    | Time     |
    | Thread  |    | Multi-intent     |    | Weather  |
    | Fire&   |    | Follow-up ctx    |    | Location |
    | Forget  |    | Clarification    |    | Prefs    |
    +---------+    +--------+---------+    +----+-----+
         |                  |                   |
         |                  v                   |
         |        +---------+---------+         |
         |        |  ACTION EXECUTOR  |<--------+
         |        +-------------------+
         |        | Plugin Router     |
         |        | Sandbox Executor  |
         |        | Progress Track    |
         |        +--------+----------+
         |                 |
         |                 v
         |        +--------+----------+
         |        | SANDBOX EXECUTOR  |
         |        +-------------------+
         |        | VM2 Isolation     |
         |        | Code Generation   |
         |        | Timeout Control   |
         |        +-------------------+
         |                 |
         +-----------------+
                  |
                  v
         +-------+--------+
         |  Voice Output  |
         |  (Piper TTS)   |
         +----------------+
```

---

## Key Components

### 1. Speech Service (Independent)
**Goal**: Speech never blocks processing, can acknowledge instantly when needed

- Runs in **Worker Thread** - never blocks main event loop
- **Fire-and-forget API** - `speak()` returns immediately
- **Smart acknowledgments** - Only for complex/long operations, NOT for quick queries
- **Priority queue** - Immediate speech interrupts current playback
- **Per-client isolation** - Each client has own queue/state

**Acknowledgment Rules**:
- Simple queries (weather, time, news) → Just respond directly, no "working on it"
- Complex queries (multi-step, analysis) → Brief acknowledgment ("On it.")
- Long operations (file processing, research) → Acknowledgment + work silently

**Files**:
- `src/speech/speechService.ts` - Interface and main service
- `src/speech/speechWorker.ts` - Worker thread TTS
- `src/speech/types.ts` - Types and interfaces

### 2. Intent Parser (Decomposition)
**Goal**: Understand compound commands, chained requests, follow-ups

- **Semantic parsing** with Claude - not just keyword matching
- **Compound detection** - "Get weather and tell me if I need umbrella"
- **Dependency extraction** - Intent B depends on Intent A's result
- **Follow-up recognition** - "And also the humidity" relates to previous
- **Clarification generation** - Ask user when ambiguous

**Files**:
- `src/intent/intentParser.ts` - Main parser
- `src/intent/types.ts` - Intent types and interfaces

### 3. Context Manager (Providers)
**Goal**: Provide client-side context (time, weather, location, etc.)

- **Provider pattern** - Register providers for different context types
- **Parallel fetch** - Get multiple contexts simultaneously
- **Staleness tracking** - Auto-refresh stale context
- **Change subscriptions** - React to context updates

**Built-in Providers**:
- `TimeContextProvider` - Current time, timezone
- `WeatherContextProvider` - Weather at client location
- `LocationContextProvider` - Client's location
- `UserPreferencesProvider` - User settings and preferences

**Files**:
- `src/context/contextManager.ts` - Manager
- `src/context/providers/*.ts` - Individual providers

### 4. Action Executor
**Goal**: Execute parsed intents with proper sequencing

- **Parallel execution** - Run independent intents simultaneously
- **Dependency resolution** - Wait for dependencies before executing
- **Progress callbacks** - Report progress for long operations
- **Fallback to sandbox** - If no plugin handles it, generate code

**Files**:
- `src/executor/actionExecutor.ts` - Main executor
- `src/executor/types.ts` - Execution types

### 5. Sandbox Executor
**Goal**: Generate and safely execute code for unknown tasks

- **Code generation** - Claude generates tool code from description
- **VM2 isolation** - Sandboxed JavaScript execution
- **Network + File access** - Can make HTTP requests and read/write files (controlled)
- **Security validation** - Static analysis, whitelist domains, restrict file paths
- **Resource limits** - Timeout, memory limits
- **Tool persistence** - Save successful tools to disk for reuse across sessions

**Capabilities**:
- HTTP requests (rate-limited, logged)
- File read/write (restricted to designated directories)
- JSON/data processing
- Text manipulation

**Files**:
- `src/sandbox/sandboxExecutor.ts` - Main executor
- `src/sandbox/codeGenerator.ts` - Claude code generation
- `src/sandbox/validator.ts` - Code validation
- `src/sandbox/toolStore.ts` - Persistent tool storage

### 6. File Finder Service
**Goal**: Intelligently locate files even when not at expected path

- **Smart search** - If file not at given path, search likely locations
- **Common locations** - Desktop, Documents, Downloads, project dirs, recent files
- **Pattern matching** - Find by partial name, extension, or content hints
- **Caching** - Remember where files were found for faster future lookups
- **Ask if ambiguous** - If multiple matches, ask user which one

**Search Order**:
1. Exact path given
2. Same filename in common directories (Desktop, Documents, Downloads)
3. Fuzzy match by filename pattern
4. Search by file extension in known locations
5. Ask user for help if still not found

**Files**:
- `src/files/fileFinder.ts` - Main finder service
- `src/files/types.ts` - File finder types

### 7. EventBus V2 (Priority Lanes)
**Goal**: Non-blocking parallel event processing

- **Priority lanes** - URGENT, HIGH, NORMAL, LOW
- **Parallel processing** - Multiple handlers per lane
- **Fire-and-forget** - Option to not wait for handlers
- **Lane isolation** - Speech events never blocked by background work

**Files**:
- `src/events/eventBusV2.ts` - New event bus

---

## Example Flow: Compound Request

**User**: "Get the weather and tell me if I need an umbrella, then remind me to pack one if I do"

```
1. CLASSIFY (0ms)
   └─> Is this quick (<1s) or complex?
       - Quick: weather, time, simple questions → NO acknowledgment, just respond
       - Complex: multi-step, file processing, analysis → Brief acknowledgment first

   This is COMPLEX (3 intents with dependencies) → Acknowledge
   └─> SpeechService.speakAcknowledgment("On it.")
       (Fire-and-forget, ~200ms)

2. PARSE (50-100ms)
   └─> IntentParser.parse(message)
       Returns:
       - Intent 1: get_weather (no dependencies)
       - Intent 2: analyze_umbrella_need (depends on 1)
       - Intent 3: create_reminder (depends on 2, conditional)

3. CONTEXT (parallel, 50ms)
   └─> ContextManager.buildSnapshot([WEATHER, LOCATION, TIME])

4. EXECUTE (sequential due to dependencies)
   └─> Intent 1: WeatherPlugin.get_weather() → {rain: true, temp: 15}
   └─> Intent 2: Claude analysis → {needsUmbrella: true}
   └─> Intent 3: ReminderPlugin.create() → {set for 8am}

5. RESPOND
   └─> SpeechService.speak(
         "It's 15 degrees with rain expected. You'll want an umbrella.
          I've set a reminder for 8am to pack one."
       )
```

**Total time**: ~1-2 seconds (vs 5-10+ seconds currently)

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

---

## Implementation Phases

### Phase 1: Foundation (Tests + Core Services)
1. **EventBus V2** - Priority lanes, parallel processing
2. **Speech Service** - Worker thread, fire-and-forget, interruption

### Phase 2: Intent System
3. **Intent Parser** - Compound detection, dependencies, follow-ups
4. **Context Manager** - Providers, parallel fetch, subscriptions

### Phase 3: Execution
5. **Action Executor** - Plan creation, parallel/sequential execution
6. **Sandbox Executor** - VM2 isolation, code generation, validation

### Phase 4: Integration
7. **New Orchestrator** - Wire all components together
8. **Migration** - Move existing plugins, remove deprecated code

---

## Test-First Approach

For each component, tests are written BEFORE implementation:

```
tests/
├── unit/
│   ├── speech/
│   │   ├── speechService.test.ts      # Fire-and-forget, queuing
│   │   └── speechWorker.test.ts       # TTS generation
│   ├── intent/
│   │   ├── intentParser.test.ts       # Compound detection
│   │   └── followUpDetector.test.ts   # Context awareness
│   ├── context/
│   │   ├── contextManager.test.ts     # Provider management
│   │   └── providers/*.test.ts        # Individual providers
│   ├── executor/
│   │   ├── actionExecutor.test.ts     # Plan execution
│   │   └── sandboxExecutor.test.ts    # Safe code execution
│   └── events/
│       └── eventBusV2.test.ts         # Priority lanes
└── integration/
    └── fullFlow.test.ts               # End-to-end scenarios
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/speech/speechService.ts` | Independent speech interface |
| `src/speech/speechWorker.ts` | Worker thread TTS |
| `src/speech/types.ts` | Speech types |
| `src/intent/intentParser.ts` | Intent decomposition |
| `src/intent/types.ts` | Intent types |
| `src/context/contextManager.ts` | Context provider system |
| `src/context/providers/*.ts` | Individual providers |
| `src/executor/actionExecutor.ts` | Intent execution |
| `src/executor/types.ts` | Execution types |
| `src/sandbox/sandboxExecutor.ts` | Safe code execution |
| `src/sandbox/codeGenerator.ts` | Claude code generation |
| `src/sandbox/validator.ts` | Code security validation |
| `src/sandbox/toolStore.ts` | Persistent generated tool storage |
| `src/files/fileFinder.ts` | Smart file location service |
| `src/files/types.ts` | File finder types |
| `src/events/eventBusV2.ts` | Priority lane event bus |
| `src/orchestrator/jackOrchestrator.ts` | New main orchestrator |

## Files to Modify

| File | Changes |
|------|---------|
| `src/server/index.ts` | Initialize new components |
| `src/server/websocket.ts` | Route to new orchestrator |
| `src/plugins/interfaces/voiceInterfacePlugin.ts` | Use new speech service |

## Files to Eventually Remove (after migration)

- `src/agent/agentOrchestrator.ts` (replaced by jackOrchestrator)
- `src/services/conversationOrchestrator.ts` (merged into new orchestrator)

---

## Verification

After implementation, verify with these tests:

1. **Speech Independence**
   - Say something complex → hear "Working on it..." within 200ms
   - Interrupt mid-speech with new command → immediate response

2. **Compound Commands**
   - "Get weather and news" → Both fetched, combined response
   - "Check weather, and if rainy, remind me about umbrella" → Conditional execution

3. **Dynamic Capability**
   - Ask JACK to process unknown file format
   - JACK generates code, executes safely, returns results

4. **Real-time Feel**
   - Simple queries: <500ms
   - Compound queries: <2s with acknowledgment
   - Complex background work: Immediate acknowledgment + async results
