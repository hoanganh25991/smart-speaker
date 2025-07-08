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
      type: process.env.TURN_DETECTION_TYPE || 'server_vad',
      threshold: parseFloat(process.env.TURN_DETECTION_THRESHOLD) || 0.6,
      prefix_padding_ms: parseInt(process.env.TURN_DETECTION_PREFIX_PADDING_MS) || 300,
      silence_duration_ms: parseInt(process.env.TURN_DETECTION_SILENCE_DURATION_MS) || 800
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
app.use(express.static(path.join(__dirname)));
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
    lastResponseTime: 0,
    isProcessingResponse: false
  });

  ws.on('message', async (message) => {
    try {
      const client = clients.get(clientId);
      
      // Handle binary audio messages for maximum performance
      if (message instanceof Buffer && message.length > 0) {
        const messageType = message[0];
        
        if (messageType === 0x01 && client.openaiWs && client.isConnected) {
          // Binary audio message - extract PCM data
          const pcmData = message.slice(1);
          const base64Audio = pcmData.toString('base64');
          
          // Direct streaming - send audio immediately
          client.openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }));
          
          // Immediate commit and response
          client.openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.commit'
          }));
          
          if (!client.isProcessingResponse) {
            client.isProcessingResponse = true;
            client.lastResponseTime = Date.now();
            
            client.openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text', 'audio'],
                instructions: config.realtime.instructions
              }
            }));
          }
        }
        return;
      }
      
      // Handle JSON messages for control
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'connect':
          await connectToOpenAI(clientId, client);
          break;
          
        case 'disconnect':
          disconnectFromOpenAI(clientId, client);
          break;
          
        case 'audio':
          if (client.openaiWs && client.isConnected && data.audio && data.audio.length > 0) {
            // Direct streaming - send audio immediately without buffering
            client.openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: data.audio
            }));
            
            // Immediate commit for real-time response
            client.openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.commit'
            }));
            
            // Trigger response immediately
            if (!client.isProcessingResponse) {
              client.isProcessingResponse = true;
              client.lastResponseTime = Date.now();
              
              client.openaiWs.send(JSON.stringify({
                type: 'response.create',
                response: {
                  modalities: ['text', 'audio'],
                  instructions: config.realtime.instructions
                }
              }));
            }
          }
          break;
          
        case 'text':
          if (client.openaiWs && client.isConnected && !client.isProcessingResponse) {
            client.isProcessingResponse = true;
            client.lastResponseTime = Date.now();
            
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
          
        case 'interrupt_response':
          if (client.openaiWs && client.isConnected) {
            console.log('Interrupting current response...');
            
            // Cancel current OpenAI response
            client.openaiWs.send(JSON.stringify({
              type: 'response.cancel'
            }));
            
            // Clear audio buffer
            client.openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.clear'
            }));
            
            // Reset processing flags immediately
            client.isProcessingResponse = false;
            client.lastResponseTime = 0; // Reset to allow immediate new response
            
            // Send confirmation to client
            ws.send(JSON.stringify({
              type: 'response_interrupted'
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
            // Send audio delta as binary for maximum performance
            if (data.delta) {
              const audioData = Buffer.from(data.delta, 'base64');
              const binaryMessage = Buffer.alloc(audioData.length + 1);
              binaryMessage[0] = 0x02; // Binary audio response type
              audioData.copy(binaryMessage, 1);
              client.ws.send(binaryMessage);
            }
            break;
          case 'response.audio.done':
          case 'response.text.delta':
          case 'response.text.done':
          case 'conversation.item.input_audio_transcription.completed':
            client.ws.send(JSON.stringify(data));
            break;
          case 'response.done':
            // Reset processing flag when response is complete
            client.isProcessingResponse = false;
            console.log(`Response completed for client ${clientId}`);
            client.ws.send(JSON.stringify(data));
            break;
          case 'error':
            // Reset processing flag on error
            client.isProcessingResponse = false;
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
  
  // Reset flags
  client.lastResponseTime = 0;
  client.isProcessingResponse = false;
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