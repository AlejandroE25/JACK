# TODO - JACK Development

## JACK v2 Redesign (Current Focus)

**Priority:** Critical
**Status:** 🚧 IN PROGRESS
**Architecture Doc:** [JACK_V2_ARCHITECTURE.md](JACK_V2_ARCHITECTURE.md)
**Implementation Guide:** [IMPLEMENTATION.md](IMPLEMENTATION.md)

Complete redesign of JACK as a real-time voice-first conversational kernel.

**Test Coverage:** 241 tests passing

---

## Current Session: Phase 5 - Integration

Next steps:
- [ ] Wire all components together
- [ ] Create main entry point
- [ ] CLI client
- [ ] Web client
- [ ] End-to-end testing

---

## Completed Phases

### Phase 1: Foundation ✓
- [x] Project Setup (Bun, TypeScript, bun:test)
- [x] MessagePack Codec (`src/protocol/codec.ts`) - 13 tests
- [x] EventBus (`src/core/eventBus.ts`) - 25 tests
- [x] WebSocket Server (`src/server/websocket.ts`) - 13 tests

### Phase 2: UI Layer ✓
- [x] Intent Parser (`src/ui/intentParser.ts`) - 15 tests
- [x] Modality Engine (`src/ui/modalityEngine.ts`) - 10 tests
- [x] Orchestrator (`src/ui/orchestrator.ts`) - 10 tests

### Phase 3: Capability Layer ✓
- [x] Context Manager (`src/capabilities/contextManager.ts`) - 25 tests
- [x] Action Executor (`src/capabilities/actionExecutor.ts`) - 15 tests
- [x] Plugin Registry (`src/capabilities/pluginRegistry.ts`) - 25 tests
- [x] File Finder (`src/capabilities/fileFinder.ts`) - 26 tests

### Phase 4: Sandbox & Speech ✓
- [x] Sandbox Executor (`src/capabilities/sandboxExecutor.ts`) - 24 tests
- [x] Speech Service (`src/capabilities/speechService.ts`) - 26 tests
- [x] Piper TTS Engine (`src/capabilities/piperEngine.ts`) - 24 tests

---

## Future Phases

### Phase 5: Integration
- [ ] Wire all components together
- [ ] CLI client
- [ ] Web client
- [ ] End-to-end testing

---

## Development Rules

1. **Test-Driven Development** - Always write tests BEFORE implementation
2. **Smart Acknowledgments** - Only acknowledge complex queries, not simple ones
3. **File Finding** - If file not found, search common locations before failing
4. **Long Tasks** - Work silently, only speak on crucial updates or completion
5. **MessagePack** - All inter-component communication uses MessagePack

---

## Notes

- Old proPACE code archived locally at `archive/` (not in git)
- Architecture doc at `docs/JACK_V2_ARCHITECTURE.md`
- Using Bun for 3-4x speed improvement over Node.js
