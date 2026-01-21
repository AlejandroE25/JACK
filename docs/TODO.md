# TODO - JACK Development

## JACK v2 Redesign (Current Focus)

**Priority:** Critical
**Status:** 🚧 IN PROGRESS
**Architecture Doc:** [JACK_V2_ARCHITECTURE.md](JACK_V2_ARCHITECTURE.md)

Complete redesign of JACK as a real-time voice-first conversational kernel.

---

### Next Session: Phase 1 - Foundation

**Stack:** Bun + TypeScript | MessagePack + JSON Schema
**Approach:** Test-Driven Development - Write tests BEFORE implementation

#### 1. Project Setup
- [ ] Initialize Bun project
- [ ] Configure TypeScript
- [ ] Set up test framework (bun:test)
- [ ] Install dependencies: msgpack, json-schema validator

#### 2. MessagePack Codec
- [ ] Write tests for `src/protocol/codec.ts`
  - [ ] Test encode/decode roundtrip
  - [ ] Test JSON Schema validation
  - [ ] Test error handling for invalid messages
- [ ] Implement codec to pass tests

#### 3. EventBus (Priority Lanes)
- [ ] Write tests for `src/core/eventBus.ts`
  - [ ] Test priority lane isolation (URGENT, HIGH, NORMAL, LOW)
  - [ ] Test parallel event processing within lanes
  - [ ] Test fire-and-forget publishing
  - [ ] Test lane doesn't block other lanes
- [ ] Implement EventBus to pass tests

#### 4. Basic WebSocket Server
- [ ] Write tests for `src/server/index.ts`
  - [ ] Test connection handling
  - [ ] Test MessagePack message parsing
  - [ ] Test client session management
- [ ] Implement server to pass tests

---

### Future Phases

#### Phase 2: Core Components
- [ ] Intent Parser - compound detection, dependencies, follow-ups (Claude Haiku)
- [ ] Context Manager - providers for time, weather, location, preferences
- [ ] Action Executor - parallel/sequential intent execution

#### Phase 3: Speech & Files
- [ ] Speech Service - separate process, Piper TTS, non-blocking
- [ ] File Finder - smart search across common locations

#### Phase 4: Sandbox & Plugins
- [ ] Sandbox Executor - V8 isolates, code generation, tool persistence
- [ ] Built-in plugins - weather, news, search, memory

#### Phase 5: Integration
- [ ] Wire all components
- [ ] CLI client
- [ ] Web client
- [ ] End-to-end testing

---

## Completed

- [x] JACK v2 architecture design
- [x] Technology decisions (Bun, MessagePack, hybrid architecture)
- [x] Archive proPACE v2 implementation (local only)
- [x] Clean project structure

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
