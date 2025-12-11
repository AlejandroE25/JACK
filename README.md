# proPACE v2.0 - TypeScript Edition

Personal AI Assistant with persistent memory, intelligent routing, and real-time communication.

## Overview

proPACE is a Jarvis-like AI assistant powered by Anthropic Claude with sophisticated subsystem orchestration:
- **Intelligent Routing**: AI-powered request routing using Claude Haiku with sub-200ms latency
- **Persistent Memory**: Remembers important details across conversations with semantic search
- **WebSocket Communication**: Real-time bidirectional messaging with web/CLI clients
- **Specialized Subsystems**: Weather, News, Wolfram Alpha for computational knowledge
- **Multi-Layer Caching**: Routing decisions, subsystem responses, and session learning
- **Standalone CLI**: Single executable with no dependencies
- **TDD Approach**: Comprehensive test coverage with 18+ test suites

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Copy environment template and add your API keys
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Development

```bash
# Run server in development mode
npm run dev

# Run CLI client in development mode
npm run dev:cli

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Production

```bash
# Build server
npm run build

# Run server
npm start

# Build standalone CLI binaries
npm run build:cli:all
# Creates: build/pace-linux, build/pace-macos, build/pace-windows.exe
```

## Project Structure

```
proPACE/
├── src/
│   ├── server/              # WebSocket server
│   ├── services/            # AI, memory, subsystems
│   ├── clients/             # API clients (Claude, OpenAI, etc.)
│   ├── types/               # TypeScript interfaces
│   ├── utils/               # Logger, cache, helpers
│   └── config/              # Configuration loader
├── tests/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
├── cli/                     # Standalone CLI client
├── data/                    # SQLite database
├── logs/                    # Application logs
└── GUIs/                    # Web interfaces (Desktop, Mobile, Big Display)
```

## API Keys Required

1. **Anthropic Claude** (Required): Get from https://console.anthropic.com/
   - Primary AI (Claude 4.5 Sonnet) for conversational responses
   - Fast routing (Claude 4.5 Haiku) for intelligent subsystem selection
2. **OpenWeatherMap** (Optional): Free tier at https://openweathermap.org/api
3. **Wolfram Alpha** (Optional): Free tier at https://products.wolframalpha.com/api/

## Architecture

### Intelligent Routing System
proPACE features a dual-model architecture optimized for both speed and intelligence:

- **Pre-Routing Validator**: Claude Haiku 4.5 analyzes each query in <200ms
- **Confidence-Based Routing**: High-confidence queries (>80%) route directly to specialized subsystems
- **Pattern Fallback**: Medium/low confidence queries validate with pattern matching
- **Multi-Layer Caching**:
  - Exact match cache (1-5ms lookups)
  - Similarity-based cache (fuzzy matching with 75% threshold)
  - LRU eviction with configurable TTL (default: 5 minutes)
- **Session Learning**: Tracks per-client patterns to predict next subsystem needs

### Memory System
- Automatically extracts important information from conversations
- Stores user preferences, facts, and context in SQLite
- Retrieves relevant memories for personalized responses
- Semantic similarity search for context-aware recall

### Specialized Subsystems
- **Weather**: Real-time weather by IP geolocation with 15-minute cache
- **News**: Latest headlines from Wikinews RSS with 1-hour cache
- **Wolfram Alpha**: Computational knowledge engine for math, science, and facts
- **Claude**: General conversation fallback for complex queries

### Performance Metrics
- Cached routing: 1-5ms
- Haiku routing: 50-200ms
- Total response time: 500ms-1s for conversational feel
- Cache hit rate: Typically >60% after warm-up

### Commands
- "remember that..." - Store specific information
- "what do you remember about...?" - Search memories
- "forget..." - Delete memories
- "what do you know about me?" - Summarize all memories
- Natural queries automatically route to appropriate subsystems

## Deployment

### Oracle Cloud Free Tier

See deployment guide in docs/ for detailed instructions on deploying to Oracle Cloud Free Tier ($0/month).

## Cost Estimate

- **Hosting**: $0/month (Oracle Cloud Free Tier)
- **Claude API**: ~$10-25/month (usage-based)
- **Other APIs**: $0-5/month (free tiers)

## License

MIT

