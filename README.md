# Realtime GPT Chat

A real-time voice and text chat application using OpenAI's Realtime API with WebSocket relay server.

## Features

- 🎤 **Voice Chat**: Real-time voice input with audio transcription
- 💬 **Text Chat**: Traditional text-based conversation
- 🔊 **Audio Response**: Hear GPT responses with natural voice
- 🌐 **WebSocket Relay**: Secure relay server for API key protection
- 📱 **Responsive Design**: Works on desktop and mobile devices
- ⚡ **Real-time**: Low latency conversation experience


#### Available Voices
- `alloy` (default)
- `echo` 
- `fable`
- `onyx`
- `nova`
- `shimmer`

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐    HTTPS/WSS    ┌─────────────────┐
│   Web Browser   │◄───────────────►│  Relay Server   │◄───────────────►│  OpenAI API     │
│                 │                 │                 │                 │                 │
│ • HTML/JS/CSS   │                 │ • Node.js       │                 │ • Realtime API  │
│ • WebSocket     │                 │ • Express       │                 │ • GPT-4o        │
│ • MediaRecorder │                 │ • WebSocket     │                 │ • TTS/STT       │
└─────────────────┘                 └─────────────────┘                 └─────────────────┘
```

## License

Copyright © 2025 Monk Journey Team. All Rights Reserved.

This project is proprietary and confidential. Unauthorized reproduction, distribution, or disclosure is prohibited. No license, express or implied, to any intellectual property rights is granted by this document.

See the [LICENSE](LICENSE) file for full details.
