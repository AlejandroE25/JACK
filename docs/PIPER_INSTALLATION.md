# Piper TTS Installation Guide

Piper is a fast, local neural text-to-speech system that replaces OpenAI's TTS API for low-latency audio generation.

## Installation on Remote Server

### Ubuntu/Debian

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y wget

# Download Piper binary
cd /tmp
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz

# Extract and install
tar -xzf piper_amd64.tar.gz
sudo cp piper/piper /usr/local/bin/
sudo chmod +x /usr/local/bin/piper

# Create voice model directory
sudo mkdir -p /usr/local/share/piper/voices

# Download voice model (en_US-lessac-medium)
cd /usr/local/share/piper/voices
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Verify installation
piper --version
```

### macOS (Local Development)

```bash
# Install via Homebrew
brew install piper-tts

# Create voice model directory
mkdir -p /usr/local/share/piper/voices

# Download voice model
cd /usr/local/share/piper/voices
curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Verify installation
piper --version
```

### Alternative Debian Package (Ubuntu 22.04+)

```bash
# Add Piper repository
sudo add-apt-repository ppa:rhasspy/piper
sudo apt-get update

# Install Piper
sudo apt-get install piper-tts

# Download voice model (same as above)
sudo mkdir -p /usr/local/share/piper/voices
cd /usr/local/share/piper/voices
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

## Testing Piper

```bash
# Test with a simple sentence
echo "Hello, I am PACE, your personal AI assistant." | piper \
  --model /usr/local/share/piper/voices/en_US-lessac-medium.onnx \
  --output-file test.wav

# Play the audio (Linux)
aplay test.wav

# Play the audio (macOS)
afplay test.wav
```

## Voice Models

Piper supports many voices. The default `en_US-lessac-medium` is recommended for PACE:
- **Quality**: High (neural TTS)
- **Speed**: ~200-300ms per sentence on CPU
- **Size**: ~63MB

### Other Available Voices

```bash
# Male voice (deeper)
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/joe/medium/en_US-joe-medium.onnx

# Female voice (higher quality, slower)
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx

# British accent
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx
```

Full voice catalog: https://rhasspy.github.io/piper-samples/

## Troubleshooting

### "piper: command not found"

```bash
# Check if piper is in PATH
which piper

# If not, add to PATH or specify full path in config
export PATH=$PATH:/usr/local/bin
```

### "Model file not found"

```bash
# Verify model file exists
ls -lh /usr/local/share/piper/voices/en_US-lessac-medium.onnx

# Re-download if missing (see installation steps above)
```

### Slow generation (>1 second)

```bash
# Use faster "low" quality model
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/low/en_US-lessac-low.onnx

# Update config.ts piperModelPath to use low quality model
```

### Permission denied

```bash
# Make piper executable
sudo chmod +x /usr/local/bin/piper

# Check ownership of voice models
ls -l /usr/local/share/piper/voices/
sudo chown -R $(whoami) /usr/local/share/piper/voices/
```

## Performance Expectations

- **Latency**: 200-500ms per sentence (vs 1500-3000ms with OpenAI)
- **CPU Usage**: ~10-20% per generation on modern CPU
- **Memory**: ~100MB for model + 50MB per concurrent generation
- **Disk Space**: ~60-200MB per voice model

## Next Steps

After installation, update your PACE configuration:

1. Set `USE_PIPER_TTS=true` in your environment
2. Restart the PACE server
3. Test voice interaction - audio should start much faster!
