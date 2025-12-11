#!/usr/bin/env node

import WebSocket from 'ws';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('\n🤖 PACE Test Client');
console.log('Connecting to ws://localhost:9001...\n');

const ws = new WebSocket('ws://localhost:9001');

ws.on('open', () => {
  console.log('✅ Connected to PACE server!\n');
  console.log('Try asking:');
  console.log('  - "Hello"');
  console.log('  - "What\'s the weather?"');
  console.log('  - "Tell me the news"');
  console.log('  - "Remember that my name is [your name]"');
  console.log('  - "What do you remember about me?"\n');
  console.log('Type "exit" to quit\n');

  promptUser();
});

ws.on('message', (data) => {
  const message = data.toString();

  // Split on $$ delimiter
  const parts = message.split('$$');
  if (parts.length === 2) {
    const [query, response] = parts;
    console.log(`\n🤖 PACE: ${response}\n`);
  } else {
    console.log(`\n🤖 PACE: ${message}\n`);
  }

  promptUser();
});

ws.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n👋 Disconnected from PACE server');
  process.exit(0);
});

function promptUser() {
  rl.question('You: ', (input) => {
    const message = input.trim();

    if (message.toLowerCase() === 'exit') {
      ws.close();
      return;
    }

    if (message) {
      ws.send(message);
    } else {
      promptUser();
    }
  });
}
