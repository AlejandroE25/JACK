# proPACE v2 Archive

This directory contains the original proPACE v2 implementation, archived on 2025-01-15 before the JACK v2 redesign.

## What's Here

- `agent/` - Agent orchestrator, planner, executor, learning engine, pattern recognition
- `services/` - Routing service, conversation orchestrator, weather/news/wolfram services
- `orchestrator/` - Legacy orchestrator types
- `plugins/` - Plugin system including voice interface, weather, news, memory plugins
- `events/` - Original EventBus implementation

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
