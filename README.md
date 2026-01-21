# JACK - Just Another Conversational Kernel

A real-time, voice-first AI assistant with intelligent intent parsing and dynamic capability generation.

## What is JACK?

JACK is designed to feel like talking to a capable assistant - not waiting for one. It understands compound commands, responds in real-time, and can generate new capabilities on-the-fly when it doesn't know how to do something.

**Key Principles:**
- **Real-time voice** - Speech never blocks processing
- **Smart, not chatty** - Simple queries get instant answers, no unnecessary acknowledgments
- **Compound understanding** - "Get the weather and remind me to bring an umbrella if it's rainy" just works
- **Self-extending** - Can write and execute code to handle unknown tasks

## Status

JACK v2 is currently being built. See [docs/JACK_V2_ARCHITECTURE.md](docs/JACK_V2_ARCHITECTURE.md) for the full architecture plan.

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Runtime** | Bun | 3-4x faster than Node.js, native TS, built-in SQLite |
| **Language** | TypeScript | Type safety, maintainability |
| **Serialization** | MessagePack + JSON Schema | Fast binary format with contract validation |
| **AI** | Claude (Haiku + Sonnet) | Fast routing + intelligent responses |
| **TTS** | Piper | Local neural TTS, ~200-500ms latency |
| **Database** | SQLite | Embedded, zero-config |
| **Communication** | WebSocket | Real-time bidirectional |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        JACK CORE (Bun/TypeScript)                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    EVENT BUS (Priority Lanes)                    ││
│  │   URGENT (Speech)  │  HIGH (Input)  │  NORMAL  │  LOW (Cleanup) ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐│
│  │ INTENT PARSER │  │    CONTEXT    │  │      ORCHESTRATOR         ││
│  │ • Compound    │  │    MANAGER    │  │ • Route to components     ││
│  │ • Follow-ups  │  │ • Time/Weather│  │ • Manage execution        ││
│  │ • Deps graph  │  │ • Location    │  │ • Background tasks        ││
│  └───────────────┘  └───────────────┘  └───────────────────────────┘│
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐│
│  │    ACTION     │  │    PLUGIN     │  │       FILE FINDER         ││
│  │   EXECUTOR    │  │   REGISTRY    │  │ • Smart search            ││
│  │ • Parallel    │  │ • Weather     │  │ • Common locations        ││
│  │ • Sequential  │  │ • News/Search │  │ • Fuzzy match             ││
│  └───────────────┘  └───────────────┘  └───────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐
   │   SPEECH    │    │   SANDBOX   │    │     EXTERNAL APIS       │
   │  (Separate) │    │ (V8 Isolate)│    │ Claude, Weather, Search │
   └─────────────┘    └─────────────┘    └─────────────────────────┘
```

## Quick Start

```bash
# Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Run tests
bun test

# Start server (coming soon)
bun run start
```

## Project Structure

```
JACK/
├── src/
│   ├── core/           # EventBus, Orchestrator, Config
│   ├── intent/         # Intent parsing
│   ├── context/        # Context providers
│   ├── executor/       # Action execution
│   ├── sandbox/        # Code generation & safe execution
│   ├── speech/         # Voice output (separate process)
│   ├── files/          # Smart file finding
│   ├── plugins/        # Built-in plugins
│   ├── server/         # WebSocket server
│   ├── protocol/       # MessagePack codec + schemas
│   └── types/          # Shared types
├── tests/
│   ├── unit/
│   └── integration/
├── schemas/            # JSON Schemas
├── docs/
│   ├── JACK_V2_ARCHITECTURE.md
│   └── TODO.md
└── package.json
```

## API Keys

| Key | Required | Purpose |
|-----|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude AI (Sonnet + Haiku) |
| `OPENWEATHERMAP_API_KEY` | No | Weather data |
| `GOOGLE_API_KEY` | No | Search |

## Development

**Test-Driven Development** - Tests are written BEFORE implementation.

```bash
bun test              # Run all tests
bun test --watch      # Watch mode
```

## Documentation

- [Architecture](docs/JACK_V2_ARCHITECTURE.md) - Full system design
- [TODO](docs/TODO.md) - Development roadmap

## License

MIT
