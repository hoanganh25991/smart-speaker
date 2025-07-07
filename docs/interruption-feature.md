# Voice Interruption Feature

## Overview
The voice interruption feature allows users to interrupt the AI assistant's responses by speaking loud and clear enough, making conversations more natural and interactive.

## How It Works

### 1. Audio Level Detection
- Continuously monitors microphone audio levels during AI responses
- Uses real-time audio analysis to detect speech patterns
- Distinguishes between background noise and intentional speech

### 2. Interruption Thresholds
- **Interruption Threshold**: Audio level (0-100) required to trigger interruption
- **Quiet Threshold**: Minimum level to differentiate from background noise
- **Interruption Delay**: Time to wait before confirming interruption (prevents false triggers)
- **Minimum Interval**: Cooldown period between interruptions

### 3. Technical Implementation

#### Client-Side (app.js)
```javascript
// Interruption detection during AI speaking
if (this.isSpeaking && level > this.interruptionThreshold) {
    this.handleInterruption(level);
}
```

#### Server-Side (server.js)
```javascript
case 'interrupt_response':
    // Cancel current OpenAI response
    client.openaiWs.send(JSON.stringify({
        type: 'response.cancel'
    }));
    
    // Clear audio buffer
    client.openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.clear'
    }));
```

## Configuration

### Environment Variables (.env)
```env
# Interruption Detection Configuration
INTERRUPTION_THRESHOLD=60          # Audio level threshold (0-100)
QUIET_THRESHOLD=20                 # Background noise threshold
INTERRUPTION_DELAY_MS=300          # Delay before triggering interruption
MIN_INTERRUPTION_INTERVAL_MS=1000  # Minimum time between interruptions
```

### Default Values
- **Interruption Threshold**: 60 (out of 100)
- **Quiet Threshold**: 20 (out of 100)
- **Interruption Delay**: 300ms
- **Minimum Interval**: 1000ms

## States and Flow

### State Management
1. **Listening**: Normal voice detection for user input
2. **Speaking**: AI is responding, monitoring for interruptions
3. **Interrupted**: AI response cancelled, returning to listening

### Interruption Flow
```
AI Speaking → Audio Level Detection → Threshold Check → Delay Timer → Interruption Trigger → Stop Audio → Clear Queue → Resume Listening
```

## Audio Processing Details

### Volume Detection
- Uses Web Audio API `AnalyserNode` with FFT analysis
- Calculates average frequency data for volume level
- Converts to 0-100 scale for threshold comparison

### Noise Filtering
- Ignores audio below quiet threshold
- Requires sustained loud speech (delay mechanism)
- Prevents false triggers from sudden noises

## User Experience

### What Triggers Interruption
- **Loud, clear speech**: Speaking at normal conversation volume
- **Sustained voice**: Must maintain volume for delay period
- **Natural conversation**: "Wait", "Stop", "Let me ask something else"

### What Doesn't Trigger Interruption
- **Background noise**: TV, music, ambient sounds
- **Quiet speech**: Whispers or very soft voice
- **Brief sounds**: Coughs, sneezes, door slams
- **Frequent interruptions**: Cooldown period prevents spam

## Visual Feedback

### Device States
- **Blue pulse**: AI is speaking (interruption possible)
- **Green pulse**: Listening for user input
- **Red indicator**: Connected to server

### Status Text
- "Speaking..." - AI responding, interruption active
- "Interrupted - Listening..." - Successfully interrupted
- "Listening..." - Ready for user input

## Troubleshooting

### Common Issues

1. **Interruption Too Sensitive**
   - Increase `INTERRUPTION_THRESHOLD` value
   - Increase `INTERRUPTION_DELAY_MS` for more confirmation time

2. **Hard to Interrupt**
   - Decrease `INTERRUPTION_THRESHOLD` value
   - Ensure microphone permissions are granted
   - Check microphone sensitivity settings

3. **False Triggers**
   - Increase `QUIET_THRESHOLD` to filter background noise
   - Increase `MIN_INTERRUPTION_INTERVAL_MS` for more cooldown

### Debug Information
- Check browser console for interruption logs
- Monitor audio levels in real-time
- Verify WebSocket connection status

## Performance Considerations

- Continuous audio monitoring uses minimal CPU
- No audio data sent during AI responses (only for interruption detection)
- Efficient cancellation prevents unnecessary network usage

## Future Enhancements

1. **Smart Interruption**: Context-aware interruption based on speech content
2. **Adaptive Thresholds**: Auto-adjust based on environment noise
3. **Voice Recognition**: Trigger only on specific wake words during responses
4. **Gesture Support**: Visual cues for interruption (hand gestures)