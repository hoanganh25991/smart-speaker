const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

// Load configuration from environment variables
const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
    voice: process.env.OPENAI_VOICE,
    language: process.env.OPENAI_LANGUAGE
  },
  server: {
    port: process.env.SERVER_PORT || 3000,
    host: process.env.SERVER_HOST || 'localhost'
  },
  realtime: {
    url: process.env.REALTIME_URL,
    instructions: process.env.REALTIME_INSTRUCTIONS,
    turn_detection: {
      type: process.env.TURN_DETECTION_TYPE,
      threshold: parseFloat(process.env.TURN_DETECTION_THRESHOLD) || 0.5,
      prefix_padding_ms: parseInt(process.env.TURN_DETECTION_PREFIX_PADDING_MS) || 300,
      silence_duration_ms: parseInt(process.env.TURN_DETECTION_SILENCE_DURATION_MS) || 200
    }
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'REALTIME_URL',
  'REALTIME_INSTRUCTIONS'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// WebSocket server for client connections
const wss = new WebSocket.Server({ server });

// Store active connections
const clients = new Map();

// WebSocket connection handler
wss.on('connection', (ws) => {
  const clientId = Date.now() + Math.random();
  console.log(`Client connected: ${clientId}`);
  
  // Store client connection
  clients.set(clientId, {
    ws: ws,
    openaiWs: null,
    isConnected: false,
    commitTimeout: null,
    audioBufferSize: 0,
    lastAudioTime: 0
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const client = clients.get(clientId);
      
      switch (data.type) {
        case 'connect':
          await connectToOpenAI(clientId, client);
          break;
          
        case 'disconnect':
          disconnectFromOpenAI(clientId, client);
          break;
          
        case 'audio':
          if (client.openaiWs && client.isConnected) {
            client.openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: data.audio
            }));
            
            // Estimate audio buffer size (base64 length * 0.75 for PCM16 at 24kHz)
            const audioBytes = data.audio.length * 0.75;
            client.audioBufferSize += audioBytes;
            client.lastAudioTime = Date.now();
            
            // Auto-commit after collecting enough audio (at least 5 seconds)
            // PCM16 at 24kHz, 1 channel = 48000 bytes per second
            const minimumBufferSize = 48000 * 5; // 5 seconds of audio
            
            // Clear existing timeout if we have new audio
            if (client.commitTimeout) {
              clearTimeout(client.commitTimeout);
              client.commitTimeout = null;
            }
            
            // Set new timeout for committing
            client.commitTimeout = setTimeout(() => {
              if (client.openaiWs && client.isConnected) {
                if (client.audioBufferSize >= minimumBufferSize) {
                  console.log(`Committing audio buffer: ${client.audioBufferSize} bytes (${(client.audioBufferSize / 48000).toFixed(2)}s)`);
                  
                  client.openaiWs.send(JSON.stringify({
                    type: 'input_audio_buffer.commit'
                  }));
                  
                  client.openaiWs.send(JSON.stringify({
                    type: 'response.create',
                    response: {
                      modalities: ['text', 'audio'],
                      instructions: config.realtime.instructions
                    }
                  }));
                  
                  // Reset buffer tracking
                  client.audioBufferSize = 0;
                } else {
                  console.log(`Audio buffer too small: ${client.audioBufferSize} bytes (${(client.audioBufferSize / 48000).toFixed(2)}s) - discarding buffer`);
                  // Clear the buffer if it's too small
                  if (client.openaiWs && client.isConnected) {
                    client.openaiWs.send(JSON.stringify({
                      type: 'input_audio_buffer.clear'
                    }));
                  }
                  client.audioBufferSize = 0;
                }
              }
              client.commitTimeout = null;
            }, 2000); // Wait 2 seconds after last audio chunk
          }
          break;
          
        case 'text':
          if (client.openaiWs && client.isConnected) {
            client.openaiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: data.text
                }]
              }
            }));
            
            client.openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text', 'audio'],
                instructions: config.realtime.instructions
              }
            }));
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing message'
      }));
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    const client = clients.get(clientId);
    if (client) {
      disconnectFromOpenAI(clientId, client);
      clients.delete(clientId);
    }
  });
});

// Connect to OpenAI Realtime API
async function connectToOpenAI(clientId, client) {
  try {
    const openaiWs = new WebSocket(config.realtime.url, {
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openaiWs.on('open', () => {
      console.log(`Connected to OpenAI for client: ${clientId}`);
      client.isConnected = true;
      
      // Send session configuration
      openaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: config.realtime.instructions,
          voice: config.openai.voice,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1',
            language: 'vi'  // Vietnamese language code
          },
          turn_detection: config.realtime.turn_detection
        }
      }));
      
      // Notify client of successful connection
      client.ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to OpenAI Realtime API'
      }));
    });

    openaiWs.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Log errors for debugging
        if (data.type === 'error') {
          console.error(`OpenAI Error for client ${clientId}:`, data.error);
        }
        
        // Forward relevant messages to client
        switch (data.type) {
          case 'response.audio.delta':
          case 'response.audio.done':
          case 'response.text.delta':
          case 'response.text.done':
          case 'conversation.item.input_audio_transcription.completed':
          case 'response.done':
          case 'error':
            client.ws.send(JSON.stringify(data));
            break;
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error);
      }
    });

    openaiWs.on('close', () => {
      console.log(`OpenAI connection closed for client: ${clientId}`);
      client.isConnected = false;
      client.ws.send(JSON.stringify({
        type: 'disconnected',
        message: 'Disconnected from OpenAI'
      }));
    });

    openaiWs.on('error', (error) => {
      console.error(`OpenAI WebSocket error for client ${clientId}:`, error);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'OpenAI connection error'
      }));
    });

    client.openaiWs = openaiWs;
    
  } catch (error) {
    console.error('Error connecting to OpenAI:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to connect to OpenAI'
    }));
  }
}

// Disconnect from OpenAI
function disconnectFromOpenAI(clientId, client) {
  if (client.openaiWs) {
    client.openaiWs.close();
    client.openaiWs = null;
    client.isConnected = false;
    console.log(`Disconnected from OpenAI for client: ${clientId}`);
  }
  
  // Clear any pending timeout
  if (client.commitTimeout) {
    clearTimeout(client.commitTimeout);
    client.commitTimeout = null;
  }
  
  // Reset buffer tracking
  client.audioBufferSize = 0;
  client.lastAudioTime = 0;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    clients: clients.size
  });
});

// Start server
const PORT = config.server.port || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Realtime GPT Chat Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Make sure to update your OpenAI API key in .env file`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});