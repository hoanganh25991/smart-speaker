#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🚀 Starting optimized smart speaker server...');

// Set performance environment variables
process.env.NODE_ENV = 'production';
process.env.UV_THREADPOOL_SIZE = '128';

// Start the server with optimized Node.js flags
const server = spawn('node', [
  '--max-old-space-size=4096',
  '--optimize-for-size',
  '--gc-interval=100',
  'server.js'
], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`🔄 Server exited with code ${code}`);
  if (code !== 0) {
    console.log('♻️  Restarting server...');
    setTimeout(() => {
      spawn(process.argv[0], process.argv.slice(1), {
        stdio: 'inherit',
        detached: true
      });
    }, 1000);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  server.kill('SIGTERM');
  process.exit(0);
});