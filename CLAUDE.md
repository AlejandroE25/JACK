# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

proPACE is a conversational AI assistant system built with Python WebSocket server architecture. It integrates multiple AI APIs (Carter Labs, OpenAI GPT, Wolfram Alpha) with real-time web interfaces for desktop, mobile, and large displays.

## Architecture

### Server-Client Model
The system uses a WebSocket-based architecture where:
- **server.py** is the main WebSocket server (port 9001) that coordinates all subsystems
- **client.py** is a text-based CLI client
- **voice client.py** is a voice-enabled client using Whisper for speech recognition
- Web-based GUIs connect via WebSocket from browsers (Desktop, Mobile, Big Display variants)

### Subsystem Architecture
The server checks and loads subsystems on startup (server.py:82-104):
- **Carter.py** - Primary conversational AI via Carter Labs API
- **Responses.py** - Response routing/orchestration layer that coordinates between Carter and Wolfram
- **News.py** - Fetches news from Wikinews RSS and generates JSON for GUIs
- **Weather.py** - Gets location via IP geolocation and weather from OpenWeatherMap API
- **Wolfram.py** - Wolfram Alpha integration for computational queries
- **gpt.py** - Legacy OpenAI GPT-3 integration (currently not in active subsystems list)

Each subsystem must implement a `check()` function for startup verification.

### Message Flow
1. Client sends message via WebSocket
2. Server receives in `message_received()` (server.py:56)
3. `Responses.generateResponse()` routes to appropriate subsystem
4. Response formatted as `{original_query}$${response}` and broadcast to all clients
5. GUIs split on `$$` delimiter to display query and response separately

### GUI Architecture
Three responsive HTML/CSS/JS interfaces in GUIs/:
- **Desktop/** - Standard desktop interface with conversation display
- **Mobile/** - Mobile-optimized interface
- **Big Display/** - Large format display interface

All GUIs:
- Connect to hardcoded WebSocket URL (currently ws://73.246.38.149:9001)
- Display time, conversation history, and text input
- Use Carter Labs TTS API for voice output
- Auto-reconnect on connection loss (index.js:70)

## Running the System

### Start the Server
```bash
python server.py
```
The server will:
- Check all subsystems for availability and functionality
- Play audio feedback during startup (requires pygame and winsound on Windows)
- Start WebSocket server on 0.0.0.0:9001
- Auto-open web GUI at http://10.0.0.227/propace/guis/desktop (server.py:128)

### Connect Clients
Text client:
```bash
python client.py
```

Voice client:
```bash
python "voice client.py"
```

Web GUI: Open GUIs/Desktop/index.html (or Mobile/Big Display variants) in browser

### Clap Activation
```bash
python clapOn.py
```
Listens for clap sound to trigger server startup (Windows only, uses pyaudio for microphone input).

## Key Dependencies

Python packages required:
- websocket-server, websocket-client
- openai (for GPT-3 integration)
- wolframalpha
- feedparser (for news)
- requests
- pygame (for audio)
- rich (for terminal formatting)
- pyfiglet (for ASCII art)
- whisper (for voice client speech recognition)
- speech_recognition, pyaudio, pydub (for audio processing)
- pyttsx3 (for TTS in voice client)
- pycaw (for Windows volume control)

## Important Notes

### Platform Considerations
- Server uses Windows-specific libraries (winsound, pycaw) - may need modification for macOS/Linux
- Volume control and beep sounds in server.py:74-113 are Windows-only
- clapOn.py uses Windows-specific `os.startfile()` (line 118)

### Hardcoded Values to Update
When deploying:
- WebSocket server IP addresses in client.py:46, voice client.py:137, and all GUI index.js files (line 52)
- Carter Labs API key in Carter.py:11 and processor.py:8
- OpenAI API key in gpt.py:3
- Wolfram Alpha API key in Wolfram.py:3
- OpenWeatherMap API key in Weather.py:21
- Web server URL in server.py:128

### Response System Evolution
Responses.py contains commented-out code showing system evolution:
- Originally used Carter + GPT-3 with intent detection
- Intent system supported weather, time, and news requests with template variable replacement
- Currently simplified to primarily use Carter API with Wolfram fallback
- Weather/News integration currently disabled (lines 63-95 commented out)

### News System
News.py writes JSON to both Desktop and Big Display GUI directories (News.py:31-34) on client connection. Uses backslash path separators (Windows-specific).

### Audio System
Voice client uses:
- Whisper "tiny.en" model for speech-to-text (voice client.py:84-86)
- Carter Labs API for TTS output (voice client.py:33-42)
- 16kHz sample rate for microphone input
- Configurable energy threshold and pause detection

## Development Tips

When modifying subsystems, ensure:
1. Implement a `check()` function that validates the subsystem works
2. Handle exceptions gracefully - server removes non-working subsystems from active list
3. The Responses subsystem is critical - server exits if it fails (server.py:106-112)

When modifying GUIs:
1. Update WebSocket URLs in all three GUI variants if server location changes
2. Message format must maintain `query$$response` structure for proper display
3. Font auto-sizing logic in fitFont() (index.js:74-83) prevents text overflow
