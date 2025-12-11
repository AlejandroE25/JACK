#!/usr/bin/env node

import WebSocket from 'ws';

console.log('\n🧪 PACE Quick Test\n');

const ws = new WebSocket('ws://localhost:9001');

ws.on('open', () => {
  console.log('✅ Connected to PACE server');

  // Test 1: Wait for welcome message
  setTimeout(() => {
    console.log('\n📤 Sending: "What\'s the weather?"');
    ws.send("What's the weather?");
  }, 1000);

  // Test 2: Ask about news
  setTimeout(() => {
    console.log('\n📤 Sending: "Tell me the news"');
    ws.send('Tell me the news');
  }, 4000);

  // Test 3: General conversation
  setTimeout(() => {
    console.log('\n📤 Sending: "Hello PACE"');
    ws.send('Hello PACE');
  }, 8000);

  // Test 4: Memory test
  setTimeout(() => {
    console.log('\n📤 Sending: "Remember that my favorite color is blue"');
    ws.send('Remember that my favorite color is blue');
  }, 12000);

  // Test 5: Memory recall
  setTimeout(() => {
    console.log('\n📤 Sending: "What do you remember about me?"');
    ws.send('What do you remember about me?');
  }, 16000);

  // Close after all tests
  setTimeout(() => {
    console.log('\n✅ All tests sent! Closing connection...\n');
    ws.close();
  }, 20000);
});

ws.on('message', (data) => {
  const message = data.toString();

  // Split on $$ delimiter
  const parts = message.split('$$');
  if (parts.length === 2) {
    const [query, response] = parts;
    if (query.trim()) {
      console.log(`\n📩 Received for "${query}":`);
    }
    console.log(`🤖 PACE: ${response}`);
  } else {
    console.log(`\n🤖 PACE: ${message}`);
  }
});

ws.on('error', (error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('👋 Test complete!\n');
  process.exit(0);
});
