const WebSocket = require('ws');

async function testWebSocketVerification() {
  console.log('🧪 Testing WebSocket verification...');
  
  // Connect to WebSocket server
  const ws = new WebSocket('ws://localhost:3001/ws/verification');
  
  ws.on('open', () => {
    console.log('📡 WebSocket connected');
    
    // Send test verification request
    const message = {
      type: 'start_text_verification',
      text: 'I won a free iPhone from apple-rewards@gmail.com, just need to pay $50 shipping to apple-claim.com',
      options: {}
    };
    
    console.log('📤 Sending verification request...');
    ws.send(JSON.stringify(message));
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📥 ${message.type}:`, message);
      
      // Close connection after final result
      if (message.type === 'final_result') {
        console.log('🎉 Test completed successfully!');
        ws.close();
        process.exit(0);
      }
    } catch (error) {
      console.error('❌ Failed to parse message:', error);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    process.exit(1);
  });
  
  ws.on('close', () => {
    console.log('📡 WebSocket closed');
  });
  
  // Timeout after 20 seconds
  setTimeout(() => {
    console.log('⏰ Test timeout');
    ws.close();
    process.exit(1);
  }, 20000);
}

testWebSocketVerification().catch(console.error);