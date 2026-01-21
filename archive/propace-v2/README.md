# proPACE v2 Archive

This directory contains the complete proPACE v2 implementation, archived on 2025-01-20 before the JACK v2 redesign.

## What's Here

- `src/` - Complete source code
  - `agent/` - Agent orchestrator, planner, executor, learning engine, pattern recognition
  - `services/` - Routing service, conversation orchestrator, weather/news/wolfram services
  - `orchestrator/` - Legacy orchestrator types
  - `plugins/` - Plugin system including voice interface, weather, news, memory plugins
  - `events/` - Original EventBus implementation
  - `server/` - WebSocket server
  - `cli/` - CLI client
  - `clients/` - Claude client
  - `types/` - TypeScript types
  - `utils/` - Utilities
- `tests/` - Test suites
- `public/` - Web interface
- `scripts/` - Deployment scripts
- `config/` - Configuration files
- `data/` - SQLite databases
- `build/` - Built CLI binaries
- `dist/` - Compiled TypeScript
- `logs/` - Application logs

## Why Archived

The system is being redesigned with a new architecture focused on:
- Real-time voice-first interaction
- Independent speech service (non-blocking)
- Intelligent intent parsing for compound commands
- Dynamic capability generation via sandboxed code execution
- Smart file finding

## Reference

These files remain available for reference during the migration to JACK v2.
The new implementation will be in the main `src/` directory.
