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
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupAudio();
    }

    initializeElements() {
        this.elements = {
            status: document.getElementById('status'),
            messages: document.getElementById('messages'),
            textInput: document.getElementById('textInput'),
            sendBtn: document.getElementById('sendBtn'),
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            recordBtn: document.getElementById('recordBtn'),
            audioLevelBar: document.getElementById('audioLevelBar'),
            micStatus: document.getElementById('micStatus')
        };
    }

    setupEventListeners() {
        // Text input
        this.elements.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendTextMessage();
            }
        });

        this.elements.sendBtn.addEventListener('click', () => {
            this.sendTextMessage();
        });

        // Connection controls
        this.elements.connectBtn.addEventListener('click', () => {
            this.connect();
        });

        this.elements.disconnectBtn.addEventListener('click', () => {
            this.disconnect();
        });

        // Audio recording
        this.elements.recordBtn.addEventListener('mousedown', () => {
            this.startRecording();
        });

        this.elements.recordBtn.addEventListener('mouseup', () => {
            this.stopRecording();
        });

        this.elements.recordBtn.addEventListener('mouseleave', () => {
            if (this.isRecording) {
                this.stopRecording();
            }
        });

        // Touch events for mobile
        this.elements.recordBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });

        this.elements.recordBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
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
            this.addMessage('system', '🎤 Đã cấp quyền truy cập microphone');
            
        } catch (error) {
            console.error('Error setting up audio:', error);
            this.addMessage('system', '❌ Không thể truy cập microphone');
        }
    }

    startAudioLevelMonitoring() {
        const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
        
        const updateLevel = () => {
            if (this.audioAnalyser) {
                this.audioAnalyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const level = (average / 255) * 100;
                this.elements.audioLevelBar.style.width = `${level}%`;
            }
            requestAnimationFrame(updateLevel);
        };
        
        updateLevel();
    }

    processRawAudioData(inputData) {
        try {
            // Convert Float32Array to PCM16
            const pcm16 = this.convertFloatToPCM16(inputData);
            const base64Audio = btoa(String.fromCharCode.apply(null, pcm16));
            
            if (this.ws && this.isConnected) {
                this.ws.send(JSON.stringify({
                    type: 'audio',
                    audio: base64Audio
                }));
            }
        } catch (error) {
            console.error('Error processing audio:', error);
        }
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
                this.addMessage('system', '✅ Đã kết nối với OpenAI Realtime API');
                // Tự động bắt đầu recording liên tục
                this.startContinuousRecording();
                break;
                
            case 'disconnected':
                this.updateConnectionStatus(false);
                this.addMessage('system', '🔌 Đã ngắt kết nối khỏi OpenAI');
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
                this.addMessage('user', `🎤 "${data.transcript}"`);
                break;
                
            case 'response.done':
                console.log('Response completed');
                break;
                
            case 'error':
                console.error('OpenAI error:', data);
                this.addMessage('system', `❌ Lỗi: ${data.error?.message || 'Lỗi không xác định'}`);
                break;
        }
    }

    handleTextDelta(data) {
        const messageId = `msg-${data.response_id}-${data.item_id}`;
        let messageElement = document.getElementById(messageId);
        
        if (!messageElement) {
            messageElement = this.createMessageElement('assistant', '', messageId);
            this.elements.messages.appendChild(messageElement);
            this.scrollToBottom();
        }
        
        messageElement.textContent += data.delta;
        this.scrollToBottom();
    }

    handleTextDone(data) {
        console.log('Text response completed');
    }

    handleAudioDelta(data) {
        if (data.delta) {
            this.audioQueue.push(data.delta);
            this.playNextAudio();
        }
    }

    handleAudioDone(data) {
        console.log('Audio response completed');
    }

    async playNextAudio() {
        if (this.currentAudio || this.audioQueue.length === 0) {
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
            source.connect(this.audioContext.destination);
            
            this.currentAudio = source;
            
            source.onended = () => {
                this.currentAudio = null;
                this.playNextAudio();
            };
            
            source.start();
            
        } catch (error) {
            console.error('Error playing audio:', error);
            this.currentAudio = null;
            this.playNextAudio();
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

    sendTextMessage() {
        const text = this.elements.textInput.value.trim();
        if (!text || !this.isConnected) return;

        this.addMessage('user', text);
        this.elements.textInput.value = '';

        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'text',
                text: text
            }));
        }
    }

    startRecording() {
        if (!this.audioProcessor || !this.isConnected || this.isRecording) return;

        this.isRecording = true;
        this.elements.recordBtn.classList.remove('idle');
        this.elements.recordBtn.classList.add('recording');
        this.elements.recordBtn.textContent = '🔴';

        // AudioProcessor sẽ tự động xử lý audio khi isRecording = true
        this.addMessage('system', '🎤 Đang thu âm...');
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        this.elements.recordBtn.classList.remove('recording');
        this.elements.recordBtn.classList.add('idle');
        this.elements.recordBtn.textContent = '🎤';

        // AudioProcessor sẽ tự động dừng xử lý audio khi isRecording = false
        this.addMessage('system', '⏹️ Đã dừng thu âm, đang xử lý...');
    }

    // Recording liên tục khi connected
    startContinuousRecording() {
        if (!this.audioProcessor || !this.isConnected) return;

        this.isRecording = true;
        this.elements.recordBtn.classList.remove('idle');
        this.elements.recordBtn.classList.add('recording');
        this.elements.recordBtn.textContent = '🔴';
        this.elements.micStatus.textContent = '🎤 MIC ON - Nói chuyện tự do!';

        // AudioProcessor sẽ tự động xử lý audio khi isRecording = true
        this.addMessage('system', '🎤 MIC BẬT - Nói chuyện tự do!');
    }

    stopContinuousRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        this.elements.recordBtn.classList.remove('recording');
        this.elements.recordBtn.classList.add('idle');
        this.elements.recordBtn.textContent = '🎤';
        this.elements.micStatus.textContent = '🎤 MIC TẮT - Đã ngắt kết nối';

        // AudioProcessor sẽ tự động dừng xử lý audio khi isRecording = false
        this.addMessage('system', '🎤 MIC TẮT');
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.elements.status.textContent = 'Đã kết nối';
            this.elements.status.className = 'status connected';
            this.elements.connectBtn.disabled = true;
            this.elements.disconnectBtn.disabled = false;
            this.elements.textInput.disabled = false;
            this.elements.sendBtn.disabled = false;
            this.elements.recordBtn.disabled = false;
        } else {
            this.elements.status.textContent = 'Chưa kết nối';
            this.elements.status.className = 'status disconnected';
            this.elements.connectBtn.disabled = false;
            this.elements.disconnectBtn.disabled = true;
            this.elements.textInput.disabled = true;
            this.elements.sendBtn.disabled = true;
            this.elements.recordBtn.disabled = true;
        }
    }

    createMessageElement(type, content, id = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        if (id) messageDiv.id = id;
        messageDiv.textContent = content;
        return messageDiv;
    }

    addMessage(type, content) {
        const messageElement = this.createMessageElement(type, content);
        this.elements.messages.appendChild(messageElement);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new RealtimeGPTChat();
});