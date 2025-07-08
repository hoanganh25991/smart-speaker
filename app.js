class RealtimeGPTChat {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.audioAnalyser = null;
        this.isRecording = false;
        this.isConnected = false;
        this.audioQueue = [];
        this.currentAudio = null;
        this.currentGain = null;
        this.lastMessageTime = 0;
        this.isWaitingForResponse = false;
        
        // Interruption handling
        this.isSpeaking = false;
        this.interruptionThreshold = 60; // Audio level threshold (0-100)
        this.quietThreshold = 20; // Background noise threshold
        this.interruptionDelay = 300; // Delay before triggering interruption (ms)
        this.minInterruptionInterval = 1000; // Minimum time between interruptions (ms)
        this.lastInterruptionTime = 0;
        this.interruptionTimer = null;
        this.isInterrupted = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupAudio();
    }

    initializeElements() {
        this.elements = {
            echoDevice: document.getElementById('echoDevice'),
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.getElementById('statusText'),
            audioVisualizer: document.getElementById('audioVisualizer')
        };
    }

    setupEventListeners() {
        // Echo device click to connect/disconnect
        this.elements.echoDevice.addEventListener('click', () => {
            if (this.isConnected) {
                this.disconnect();
            } else {
                this.connect();
            }
        });

        // Touch events for mobile
        this.elements.echoDevice.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.isConnected) {
                this.disconnect();
            } else {
                this.connect();
            }
        });
    }

    async setupAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 24000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });
            
            const source = this.audioContext.createMediaStreamSource(stream);
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioAnalyser.fftSize = 256;
            source.connect(this.audioAnalyser);
            
            // Sử dụng ScriptProcessorNode để capture raw PCM data
            this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
            source.connect(this.audioProcessor);
            
            // Tạo silent output để tránh feedback
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0;
            this.audioProcessor.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            this.audioProcessor.onaudioprocess = (event) => {
                if (this.isRecording && this.isConnected) {
                    const inputData = event.inputBuffer.getChannelData(0);
                    this.processRawAudioData(inputData);
                }
            };
            
            this.startAudioLevelMonitoring();
            this.updateStatusText('Microphone ready');
            
        } catch (error) {
            console.error('Error setting up audio:', error);
            this.updateStatusText('Microphone access denied');
        }
    }

    startAudioLevelMonitoring() {
        const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
        
        const updateLevel = () => {
            if (this.audioAnalyser && this.isConnected) {
                this.audioAnalyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const level = (average / 255) * 100;
                
                // Check for interruption during AI speaking
                if (this.isSpeaking && level > this.interruptionThreshold) {
                    this.handleInterruption(level);
                }
                
                // Update visual effects based on audio level
                if (level > 10 && this.isRecording && !this.isSpeaking) {
                    this.elements.audioVisualizer.classList.remove('hidden');
                    this.elements.echoDevice.classList.add('listening');
                    this.elements.echoDevice.classList.remove('idle', 'speaking');
                } else if (this.isConnected && !this.isRecording && !this.isSpeaking) {
                    this.elements.audioVisualizer.classList.add('hidden');
                    this.elements.echoDevice.classList.add('idle');
                    this.elements.echoDevice.classList.remove('listening', 'speaking');
                }
            }
            requestAnimationFrame(updateLevel);
        };
        
        updateLevel();
    }

    handleInterruption(level) {
        const now = Date.now();
        
        // Check if we're in cooldown period
        if (now - this.lastInterruptionTime < this.minInterruptionInterval) {
            return;
        }
        
        // Clear any existing timer
        if (this.interruptionTimer) {
            clearTimeout(this.interruptionTimer);
        }
        
        // Set a timer to confirm interruption after delay
        this.interruptionTimer = setTimeout(() => {
            if (this.isSpeaking && !this.isInterrupted) {
                console.log('Interruption detected - stopping AI response');
                this.triggerInterruption();
            }
        }, this.interruptionDelay);
    }

    triggerInterruption() {
        this.isInterrupted = true;
        this.lastInterruptionTime = Date.now();
        
        // Stop current audio playback immediately
        this.stopCurrentAudio();
        
        // Clear audio queue
        this.audioQueue = [];
        
        // Stop any ongoing Web Audio API playback
        if (this.audioContext) {
            try {
                // Stop all AudioBufferSourceNodes
                this.audioContext.suspend();
                setTimeout(() => {
                    if (this.audioContext.state === 'suspended') {
                        this.audioContext.resume();
                    }
                }, 100);
            } catch (error) {
                console.warn('Error suspending audio context:', error);
            }
        }
        
        // Send interruption signal to server
        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'interrupt_response'
            }));
        }
        
        // Update UI state
        this.isSpeaking = false;
        this.isWaitingForResponse = false;
        this.elements.echoDevice.classList.remove('speaking');
        this.elements.echoDevice.classList.add('listening');
        this.updateStatusText('Interrupted - Listening...');
        
        // Clear interruption timer
        if (this.interruptionTimer) {
            clearTimeout(this.interruptionTimer);
            this.interruptionTimer = null;
        }
        
        // Reset interruption flag after a short delay
        setTimeout(() => {
            this.isInterrupted = false;
        }, 500);
    }

    stopCurrentAudio() {
        if (this.currentAudio) {
            try {
                // Immediately fade out the audio for smoother interruption
                if (this.currentGain) {
                    this.currentGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05);
                }
                
                // Stop the audio source after the fade
                setTimeout(() => {
                    if (this.currentAudio) {
                        this.currentAudio.stop();
                        this.currentAudio.disconnect();
                        this.currentAudio = null;
                    }
                    if (this.currentGain) {
                        this.currentGain.disconnect();
                        this.currentGain = null;
                    }
                }, 50);
                
            } catch (error) {
                console.log('Audio already stopped or completed');
            }
        }
        
        // Clear any pending audio in the queue
        this.audioQueue = [];
        
        // Reset audio-related flags
        this.isSpeaking = false;
        this.isWaitingForResponse = false;
    }

    processRawAudioData(inputData) {
        try {
            // Skip audio processing if waiting for response (prevent audio echo)
            if (this.isWaitingForResponse) {
                return;
            }
            
            // Skip audio processing if AI is speaking and we're not interrupted
            if (this.isSpeaking && !this.isInterrupted) {
                return;
            }
            
            // Check if we have meaningful audio data
            const hasAudio = this.hasSignificantAudio(inputData);
            if (!hasAudio) {
                return;
            }
            
            // Convert Float32Array to PCM16
            const pcm16 = this.convertFloatToPCM16(inputData);
            const base64Audio = btoa(String.fromCharCode.apply(null, pcm16));
            
            if (this.ws && this.isConnected && base64Audio.length > 0) {
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    audio: base64Audio
                }));
            }
        } catch (error) {
            console.error('Error processing audio:', error);
        }
    }
    
    hasSignificantAudio(inputData) {
        // Check if the audio has meaningful content (not just silence)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += Math.abs(inputData[i]);
        }
        const average = sum / inputData.length;
        return average > 0.001; // Threshold for meaningful audio
    }

    convertFloatToPCM16(float32Array) {
        const pcm16 = new Int16Array(float32Array.length);
        
        for (let i = 0; i < float32Array.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        
        for (let i = 0; i < pcm16.length; i++) {
            view.setInt16(i * 2, pcm16[i], true); // little-endian
        }
        
        return new Uint8Array(buffer);
    }

    convertToPCM16(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0);
        const pcm16 = new Int16Array(channelData.length);
        
        for (let i = 0; i < channelData.length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        
        for (let i = 0; i < pcm16.length; i++) {
            view.setInt16(i * 2, pcm16[i], true); // little-endian
        }
        
        return new Uint8Array(buffer);
    }

    connect() {
        if (this.ws) {
            this.ws.close();
        }

        // Connect to remote server
        const wsUrl = 'wss://sereneai.vn/smart-speaker';
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('Connected to relay server');
            this.ws.send(JSON.stringify({ type: 'connect' }));
        };

        this.ws.onmessage = (event) => {
            this.handleWebSocketMessage(JSON.parse(event.data));
        };

        this.ws.onclose = () => {
            console.log('Disconnected from relay server');
            this.updateConnectionStatus(false);
            this.stopContinuousRecording();
            // Reset waiting flag on disconnect
            this.isWaitingForResponse = false;
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.addMessage('system', '❌ Lỗi kết nối');
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.send(JSON.stringify({ type: 'disconnect' }));
            this.ws.close();
        }
        this.updateConnectionStatus(false);
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'connected':
                this.updateConnectionStatus(true);
                this.updateStatusText('Connected - Ready to chat');
                // Tự động bắt đầu recording liên tục
                this.startContinuousRecording();
                break;
                
            case 'disconnected':
                this.updateConnectionStatus(false);
                this.updateStatusText('Disconnected');
                this.stopContinuousRecording();
                break;
                
            case 'response.text.delta':
                this.handleTextDelta(data);
                break;
                
            case 'response.text.done':
                this.handleTextDone(data);
                break;
                
            case 'response.audio.delta':
                this.handleAudioDelta(data);
                break;
                
            case 'response.audio.done':
                this.handleAudioDone(data);
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                // Transcription completed but we don't display it
                console.log('Transcription:', data.transcript);
                break;
                
            case 'response.done':
                console.log('Response completed');
                // Reset waiting flag to allow new requests
                this.isWaitingForResponse = false;
                this.isSpeaking = false;
                this.updateStatusText('Listening...');
                break;
                
            case 'response_interrupted':
                console.log('Response interrupted by server');
                // Stop any playing audio immediately
                this.stopCurrentAudio();
                // Reset all states
                this.isWaitingForResponse = false;
                this.isSpeaking = false;
                this.isInterrupted = false;
                this.audioQueue = [];
                this.elements.echoDevice.classList.remove('speaking');
                this.elements.echoDevice.classList.add('listening');
                this.updateStatusText('Listening...');
                break;
                
            case 'error':
                console.error('OpenAI error:', data);
                this.updateStatusText(`Error: ${data.error?.message || 'Unknown error'}`);
                // Reset waiting flag on error
                this.isWaitingForResponse = false;
                break;
        }
    }

    handleTextDelta(data) {
        // Text responses are handled via audio in voice-only mode
        console.log('Text delta:', data.delta);
    }

    handleTextDone(data) {
        console.log('Text response completed');
    }

    handleAudioDelta(data) {
        if (data.delta && !this.isInterrupted) {
            this.audioQueue.push(data.delta);
            this.playNextAudio();
            // Show speaking state
            this.isSpeaking = true;
            this.elements.echoDevice.classList.add('speaking');
            this.elements.echoDevice.classList.remove('listening', 'idle');
            this.updateStatusText('Speaking...');
        }
    }

    handleAudioDone(data) {
        console.log('Audio response completed');
        // Return to listening state
        this.isSpeaking = false;
        this.elements.echoDevice.classList.add('idle');
        this.elements.echoDevice.classList.remove('speaking', 'listening');
        this.updateStatusText('Listening...');
    }

    async playNextAudio() {
        if (this.currentAudio || this.audioQueue.length === 0 || this.isInterrupted) {
            return;
        }

        try {
            const base64Audio = this.audioQueue.shift();
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Convert PCM16 to AudioBuffer
            const audioBuffer = await this.pcm16ToAudioBuffer(bytes);
            
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            
            // Create a gain node for volume control and immediate stopping
            const gainNode = this.audioContext.createGain();
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            this.currentAudio = source;
            this.currentGain = gainNode;
            
            source.onended = () => {
                this.currentAudio = null;
                this.currentGain = null;
                if (!this.isInterrupted && this.audioQueue.length > 0) {
                    this.playNextAudio();
                } else if (this.audioQueue.length === 0) {
                    // All audio finished
                    this.isSpeaking = false;
                    this.elements.echoDevice.classList.remove('speaking');
                    this.elements.echoDevice.classList.add('idle');
                    this.updateStatusText('Listening...');
                }
            };
            
            source.start();
            
        } catch (error) {
            console.error('Error playing audio:', error);
            this.currentAudio = null;
            this.currentGain = null;
            if (!this.isInterrupted) {
                this.playNextAudio();
            }
        }
    }

    async pcm16ToAudioBuffer(pcm16Data) {
        const samples = pcm16Data.length / 2;
        const audioBuffer = this.audioContext.createBuffer(1, samples, 24000);
        const channelData = audioBuffer.getChannelData(0);
        
        const dataView = new DataView(pcm16Data.buffer);
        for (let i = 0; i < samples; i++) {
            const sample = dataView.getInt16(i * 2, true) / 0x8000;
            channelData[i] = sample;
        }
        
        return audioBuffer;
    }

    // Text messaging removed - voice only interface

    startRecording() {
        if (!this.audioProcessor || !this.isConnected || this.isRecording) return;

        this.isRecording = true;
        this.elements.echoDevice.classList.add('listening');
        this.elements.echoDevice.classList.remove('idle', 'speaking');
        this.updateStatusText('Recording...');
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        this.elements.echoDevice.classList.add('idle');
        this.elements.echoDevice.classList.remove('listening', 'speaking');
        this.updateStatusText('Processing...');
    }

    // Recording liên tục khi connected
    startContinuousRecording() {
        if (!this.audioProcessor || !this.isConnected) return;

        this.isRecording = true;
        this.elements.echoDevice.classList.add('idle');
        this.elements.echoDevice.classList.remove('listening', 'speaking');
        this.updateStatusText('Listening...');
    }

    stopContinuousRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        this.elements.echoDevice.classList.remove('listening', 'speaking', 'idle');
        this.updateStatusText('Disconnected');
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.elements.statusIndicator.classList.add('connected');
            this.updateStatusText('Connected - Ready to chat');
        } else {
            this.elements.statusIndicator.classList.remove('connected');
            this.updateStatusText('Tap to connect');
            this.elements.echoDevice.classList.remove('listening', 'speaking');
            this.elements.echoDevice.classList.add('idle');
        }
    }

    updateStatusText(text) {
        this.elements.statusText.textContent = text;
        
        // Update text color based on state
        if (text.includes('Listening') || text.includes('Recording')) {
            this.elements.statusText.className = 'status-text listening';
        } else if (text.includes('Speaking')) {
            this.elements.statusText.className = 'status-text speaking';
        } else {
            this.elements.statusText.className = 'status-text';
        }
    }
}

// Note: Application is initialized from index.html to prevent duplicate instances