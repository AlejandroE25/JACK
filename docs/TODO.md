# TODO - JACK Development

## JACK v2 Redesign (Current Focus)

**Priority:** Critical
**Status:** 🚧 IN PROGRESS
**Architecture Doc:** [docs/JACK_V2_ARCHITECTURE.md](JACK_V2_ARCHITECTURE.md)

Complete redesign of JACK from response-oriented assistant to real-time voice-first conversational kernel.

### Next Session: Phase 1 - Foundation

**Approach:** Test-Driven Development - Write tests BEFORE implementation

#### 1. EventBus V2 (Priority Lanes)
- [ ] Write tests for `src/events/eventBusV2.ts`
  - [ ] Test priority lane isolation (URGENT, HIGH, NORMAL, LOW)
  - [ ] Test parallel event processing within lanes
  - [ ] Test fire-and-forget publishing
  - [ ] Test lane doesn't block other lanes
- [ ] Implement EventBus V2 to pass tests

#### 2. Speech Service (Independent Worker Thread)
- [ ] Write tests for `src/speech/speechService.ts`
  - [ ] Test fire-and-forget speak() returns immediately
  - [ ] Test smart acknowledgments (only for complex queries)
  - [ ] Test priority queue (immediate interrupts current)
  - [ ] Test per-client isolation
  - [ ] Test interruption support
- [ ] Write tests for `src/speech/speechWorker.ts`
  - [ ] Test TTS generation in worker
  - [ ] Test abort handling
- [ ] Implement Speech Service to pass tests

### Future Phases

#### Phase 2: Intent System
- [ ] Intent Parser - compound detection, dependencies, follow-ups
- [ ] Context Manager - providers for time, weather, location, preferences

#### Phase 3: Execution
- [ ] Action Executor - parallel/sequential intent execution
- [ ] Sandbox Executor - VM2 isolation, code generation, tool persistence

#### Phase 4: Integration
- [ ] File Finder Service - smart file location
- [ ] New Orchestrator - wire all components
- [ ] Migration - move plugins, remove deprecated code

---

## Archived: proPACE v2 Items

The following items are from proPACE v2 and are now superseded by the JACK v2 redesign.
Old implementation archived at `archive/propace-v2/`.

<details>
<summary>Click to expand archived items</summary>

### Browser Voice Interface (Superseded)
Was planned for proPACE but will be reimplemented with new architecture.

### API Endpoints (May be reused)
REST endpoints for server info - may be incorporated into JACK v2.

### CLI/Dashboard Improvements (Deferred)
Will revisit after JACK v2 core is complete.

</details>

---

## Completed

- [x] JACK v2 architecture design and planning
- [x] Archive proPACE v2 implementation
- [x] Document new architecture in docs/JACK_V2_ARCHITECTURE.md
- [x] Windows compatibility fix for server startup
- [x] NSSM deployment script fixes
- [x] SSH setup documentation
- [x] Status dashboard with blessed
- [x] New CLI with blessed framework
- [x] Fast-path routing in agent mode
- [x] Google Search integration
- [x] Butler personality mode

---

## Development Rules

1. **Test-Driven Development** - Always write tests BEFORE implementation
2. **Smart Acknowledgments** - Only acknowledge complex queries, not simple ones
3. **File Finding** - If file not found, search common locations before failing
4. **Long Tasks** - Work silently, only speak on crucial updates or completion

---

## Notes

- Old proPACE code archived at `archive/propace-v2/`
- Architecture doc at `docs/JACK_V2_ARCHITECTURE.md`
- Keep backwards compatibility during migration
- Test on all platforms before release
