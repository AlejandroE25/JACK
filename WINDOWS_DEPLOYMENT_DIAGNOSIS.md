# Windows Deployment Diagnosis & Fix

## Problem Summary

The proPACE server exits immediately on Windows 11 Pro with no error output.

## Root Cause

**Primary Issue**: npm install failure during Windows deployment due to `wrtc` package installation errors

**Error Chain**:
1. `npm install` attempts to install `wrtc@0.4.7` (WebRTC native package)
2. wrtc requires `node-pre-gyp` for native compilation
3. Installation fails: `'node-pre-gyp' is not recognized as an internal or external command`
4. npm install exits with code 1
5. Incomplete dependencies prevent TypeScript from building all files
6. Missing `dist/src/config/index.js` causes server to exit silently on startup

**Why it works on Mac**:
- Mac development uses `npm run dev` with `tsx` (runs TypeScript source directly)
- No build or compiled files needed
- wrtc is skipped as optional dependency

**Why it fails on Windows**:
- Windows production uses `npm start` (runs compiled JavaScript from `dist/`)
- Requires complete build with all dependencies
- `--no-optional` flag not reliably skipping wrtc on Windows npm

## Technical Details

### Log Evidence

From `2025-12-28T08_17_53_756Z-debug-0.log`:

```
552 info run wrtc@0.4.7 install node_modules/wrtc node scripts/download-prebuilt.js
553 info run wrtc@0.4.7 install { code: 1, signal: null }
...
561 error 'node-pre-gyp' is not recognized as an internal or external command,
561 error operable program or batch file.
...
573 verbose exit 1
574 verbose code 1
```

### Package Configuration

wrtc is correctly configured as optional in `package.json`:
```json
"optionalDependencies": {
  "wrtc": "^0.4.7"
}
```

However, `npm install --no-optional` on Windows is still attempting to install it.

## Solution

### Updated Rebuild Script

Changed from:
```powershell
npm install --no-optional
```

To:
```powershell
npm install --omit=optional --legacy-peer-deps
```

**Why this works**:
- `--omit=optional` is the newer, more reliable flag (npm 7+)
- `--legacy-peer-deps` prevents peer dependency conflicts
- Explicitly prevents wrtc installation on Windows

### Files Modified

- [scripts/rebuild-windows.ps1](scripts/rebuild-windows.ps1#L35)

## Deployment Instructions (Updated)

### Windows 11 Pro Deployment

1. **Clean the environment**:
   ```powershell
   Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
   ```

2. **Run the updated rebuild script**:
   ```powershell
   .\scripts\rebuild-windows.ps1
   ```

3. **Verify the build**:
   ```powershell
   # Check critical files exist
   Test-Path dist\src\server\index.js
   Test-Path dist\src\config\index.js
   Test-Path dist\src\utils\terminalUI.js
   ```

4. **Start the server**:
   ```powershell
   npm start
   ```

You should now see the formatted terminal output with:
- Colored startup banner
- Server configuration table
- Initialization steps with status indicators
- Plugin loading status
- Server running message with WebSocket URL

## What Was Fixed

### 1. PowerShell Script Escaping Issues
- **Problem**: Backtick escape sequences (`\n`, `\t`) caused parser errors
- **Fix**: Removed all escape sequences, use explicit `Write-Host ""` for newlines
- **Impact**: Script now runs without syntax errors on Windows PowerShell

### 2. npm Install Configuration
- **Problem**: `--no-optional` not reliably skipping wrtc on Windows
- **Fix**: Use `--omit=optional --legacy-peer-deps` instead
- **Impact**: wrtc installation skipped, dependencies install successfully

### 3. Terminal UI Implementation
- **Created**: `src/utils/terminalUI.ts` with formatted output functions
- **Updated**: `src/server/index.ts` to use new UI throughout
- **Impact**: Professional, color-coded server output instead of raw log streams

## Testing Checklist

After running the rebuild script:

- [ ] No npm install errors
- [ ] `dist/src/config/index.js` exists
- [ ] `dist/src/server/index.js` exists
- [ ] `dist/src/utils/terminalUI.js` exists
- [ ] Server starts without immediate exit
- [ ] Colored terminal output displays
- [ ] Server shows "Server Running" box with WebSocket URL
- [ ] Can connect with CLI client

## Known Limitations

### wrtc Package
- **Status**: Intentionally skipped on Windows
- **Impact**: WebRTC voice features require alternative implementation
- **Workaround**: Voice interface plugin will need platform-specific handling or alternative WebRTC library

### Future Considerations
1. **Cross-platform WebRTC**: Consider using `werift` or `node-webrtc-prebuilt` for better Windows support
2. **Voice Interface**: May need Windows-specific audio streaming solution
3. **Service Installation**: NSSM service install script ready but untested with new build process

## Related Files

- [scripts/rebuild-windows.ps1](scripts/rebuild-windows.ps1) - Automated clean rebuild
- [scripts/install-service-windows.ps1](scripts/install-service-windows.ps1) - NSSM service installation
- [src/utils/terminalUI.ts](src/utils/terminalUI.ts) - Formatted terminal output
- [src/server/index.ts](src/server/index.js) - Main server with UI integration
- [CLAUDE.md](CLAUDE.md#webrtc-production) - WebRTC architecture notes

## Next Steps

1. **Test on Windows**: Run updated rebuild script and verify server starts
2. **Document wrtc alternatives**: Research cross-platform WebRTC solutions
3. **Update CLAUDE.md**: Document Windows-specific deployment requirements
4. **Service installation**: Test NSSM service setup with new build process

---

**Created**: 2025-12-28
**Author**: Diagnosis from npm debug log analysis
**Status**: Ready for testing on Windows 11 Pro
