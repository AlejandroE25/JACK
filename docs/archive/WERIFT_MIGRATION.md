# Migration from wrtc to werift

## Overview

Migrating from `wrtc` (unmaintained, Node 10-18 only) to `werift` (actively maintained, Node 16+ including Node 24).

## API Comparison

### wrtc (Current)
```typescript
import wrtc from 'wrtc';
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;

const pc = new RTCPeerConnection({ iceServers });
const dc = pc.createDataChannel('label', { ordered: true });
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
```

### werift (Target)
```typescript
import { RTCPeerConnection, RTCDataChannel } from 'werift';

const pc = new RTCPeerConnection({ iceServers });
const dc = pc.createDataChannel('label', { ordered: true });
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
```

## Key Differences

1. **Import Structure**
   - wrtc: Default export with all classes
   - werift: Named exports

2. **RTCPeerConnection**
   - API is nearly identical
   - Both support standard WebRTC API

3. **Data Channels**
   - Both support ordered/unordered channels
   - Event handlers: `onopen`, `onclose`, `onerror`, `onmessage`
   - werift has better TypeScript types

4. **Session Descriptions**
   - werift uses `RTCSessionDescription` class (same as standard)
   - API compatible

## Migration Steps

1. Update package.json dependencies
2. Replace import statements
3. Update TypeScript types
4. Test all WebRTC functionality
5. Update tests to use werift

## Compatibility Matrix

| Feature | wrtc | werift |
|---------|------|--------|
| Node 18 | ✅ | ✅ |
| Node 20 | ❌ | ✅ |
| Node 24 | ❌ | ✅ |
| Data Channels | ✅ | ✅ |
| TypeScript | Partial | Full |
| Maintained | ❌ (2020) | ✅ (2024) |
| Pure JS | ❌ (native) | ✅ |

## Files to Update

1. `package.json` - Replace wrtc with werift
2. `src/plugins/interfaces/webrtc/webrtcPeerManager.ts` - Update imports
3. `src/plugins/interfaces/webrtc/signalingService.ts` - Update types
4. `tests/unit/server/webrtc/*.test.ts` - Update test mocks

## Testing Plan

1. Unit tests for RTCPeerConnection creation
2. Data channel send/receive tests
3. Signaling (offer/answer/ICE) tests
4. Integration test with browser client
5. Load test with multiple concurrent connections

## Rollback Plan

If werift has issues:
1. Git revert to wrtc implementation
2. Downgrade server to Node 18
3. Install wrtc on Node 18

## References

- werift GitHub: https://github.com/shinyoshiaki/werift-webrtc
- werift npm: https://www.npmjs.com/package/werift
- WebRTC API Spec: https://w3c.github.io/webrtc-pc/
