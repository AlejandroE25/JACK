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

JACK v2 is currently being redesigned. See [docs/JACK_V2_ARCHITECTURE.md](docs/JACK_V2_ARCHITECTURE.md) for the full architecture plan.

### Architecture Overview

```
                    User Voice/Text Input
                             |
                             v
              +-----------------------------+
              |   EVENT BUS (Priority Lanes) |
              +-----------------------------+
                    |       |       |
          +---------+       |       +---------+
          v                 v                 v
    +-----------+    +-------------+    +-----------+
    |  SPEECH   |    |   INTENT    |    |  CONTEXT  |
    |  SERVICE  |    |   PARSER    |    |  MANAGER  |
    +-----------+    +-------------+    +-----------+
    | Worker    |    | Compound    |    | Time      |
    | Thread    |    | Detection   |    | Weather   |
    | Non-block |    | Follow-ups  |    | Location  |
    +-----------+    +------+------+    +-----+-----+
                            |                 |
                            v                 |
                    +-------+-------+         |
                    | ACTION EXEC   |<--------+
                    +---------------+
                    | Plugin Router |
                    | Sandbox Exec  |
                    +-------+-------+
                            |
                            v
                    +---------------+
                    |   SANDBOX     |
                    +---------------+
                    | VM2 Isolation |
                    | Code Gen      |
                    | Tool Persist  |
                    +---------------+
```

### Core Components (In Development)

| Component | Purpose | Status |
|-----------|---------|--------|
| **Speech Service** | Non-blocking voice in worker thread | Planned |
| **Intent Parser** | Compound commands, follow-ups, clarification | Planned |
| **Context Manager** | Time, weather, location, preferences | Planned |
| **Action Executor** | Parallel/sequential intent execution | Planned |
| **Sandbox Executor** | Safe code generation and execution | Planned |
| **File Finder** | Smart file location across common paths | Planned |
| **EventBus V2** | Priority lanes, parallel processing | Planned |

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Development
npm run dev        # Start server
npm run dev:cli    # Start CLI client

# Production
npm run build
npm start
```

## Project Structure

```
JACK/
├── src/
│   ├── server/          # WebSocket server
│   ├── speech/          # Independent speech service (planned)
│   ├── intent/          # Intent parsing (planned)
│   ├── context/         # Context providers (planned)
│   ├── executor/        # Action execution (planned)
│   ├── sandbox/         # Safe code execution (planned)
│   ├── files/           # Smart file finding (planned)
│   ├── events/          # Event bus
│   ├── plugins/         # Plugin system
│   ├── services/        # Core services
│   └── types/           # TypeScript types
├── tests/               # Test suites
├── docs/
│   ├── JACK_V2_ARCHITECTURE.md  # Full architecture
│   ├── TODO.md                   # Development roadmap
│   └── PIPER_INSTALLATION.md    # TTS setup
├── archive/             # Old proPACE implementation
└── public/              # Web interface
```

## API Keys

| Key | Required | Purpose |
|-----|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude AI (Sonnet + Haiku) |
| `OPENWEATHERMAP_API_KEY` | No | Weather data |
| `WOLFRAM_ALPHA_APP_ID` | No | Computational queries |

## Development Approach

**Test-Driven Development** - Tests are written BEFORE implementation.

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Documentation

- [Architecture](docs/JACK_V2_ARCHITECTURE.md) - Full system design
- [TODO](docs/TODO.md) - Development roadmap
- [Piper TTS](docs/PIPER_INSTALLATION.md) - Local TTS setup

## Tech Stack

- **Runtime**: Node.js 20+ / TypeScript
- **AI**: Anthropic Claude (Sonnet + Haiku)
- **TTS**: Piper (local, fast)
- **Database**: SQLite
- **Communication**: WebSocket
- **Testing**: Vitest

## License

MIT
