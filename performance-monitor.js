// Performance monitoring for optimized streaming
class PerformanceMonitor {
    constructor() {
        this.audioLatencyStats = [];
        this.memoryStats = [];
        this.startTime = Date.now();
        this.audioChunksProcessed = 0;
        this.averageLatency = 0;
        
        this.startMonitoring();
    }
    
    startMonitoring() {
        // Monitor every 5 seconds
        setInterval(() => {
            this.logStats();
        }, 5000);
    }
    
    recordAudioLatency(startTime, endTime) {
        const latency = endTime - startTime;
        this.audioLatencyStats.push(latency);
        this.audioChunksProcessed++;
        
        // Keep only last 100 measurements
        if (this.audioLatencyStats.length > 100) {
            this.audioLatencyStats.shift();
        }
        
        // Calculate average latency
        this.averageLatency = this.audioLatencyStats.reduce((a, b) => a + b, 0) / this.audioLatencyStats.length;
    }
    
    recordMemoryUsage() {
        const memUsage = process.memoryUsage();
        this.memoryStats.push({
            timestamp: Date.now(),
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external
        });
        
        // Keep only last 60 measurements (5 minutes)
        if (this.memoryStats.length > 60) {
            this.memoryStats.shift();
        }
    }
    
    logStats() {
        this.recordMemoryUsage();
        
        const uptime = (Date.now() - this.startTime) / 1000;
        const currentMem = this.memoryStats[this.memoryStats.length - 1];
        
        console.log(`
📊 Performance Stats (Uptime: ${uptime.toFixed(1)}s)
🎵 Audio Chunks Processed: ${this.audioChunksProcessed}
⚡ Average Latency: ${this.averageLatency.toFixed(2)}ms
🧠 Memory Usage: ${(currentMem.heapUsed / 1024 / 1024).toFixed(1)}MB
💾 Total Memory: ${(currentMem.rss / 1024 / 1024).toFixed(1)}MB
        `);
    }
    
    getOptimizationReport() {
        return {
            totalChunks: this.audioChunksProcessed,
            averageLatency: this.averageLatency,
            uptime: (Date.now() - this.startTime) / 1000,
            memoryEfficiency: this.memoryStats.length > 0 ? 
                (this.memoryStats[this.memoryStats.length - 1].heapUsed / 1024 / 1024).toFixed(1) + 'MB' : 'N/A'
        };
    }
}

// Export for use in server
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceMonitor;
}