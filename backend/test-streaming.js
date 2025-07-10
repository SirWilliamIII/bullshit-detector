const FallbackStreamingEngine = require('./services/streaming/FallbackStreamingEngine');

async function testStreaming() {
  console.log('🔍 Testing streaming verification...');
  
  const engine = new FallbackStreamingEngine();
  await engine.initialize();
  
  const testText = "I won a free iPhone from apple-rewards@gmail.com, just need to pay $50 shipping to apple-claim.com";
  
  const { streamId, stream } = await engine.startStreamingVerification(testText);
  
  console.log(`📡 Stream started: ${streamId}`);
  
  // Listen for events
  stream.on('status', (data) => {
    console.log(`📊 Status: ${data.stage} - ${data.message} (${data.progress}%)`);
  });
  
  stream.on('context_detected', (data) => {
    console.log(`🎯 Context: ${data.context}`);
  });
  
  stream.on('plan_created', (data) => {
    console.log(`📋 Plan: ${data.totalSources} sources`);
  });
  
  stream.on('source_started', (data) => {
    console.log(`🔄 Source started: ${data.source}`);
  });
  
  stream.on('source_completed', (data) => {
    console.log(`✅ Source completed: ${data.source} - ${data.status}`);
  });
  
  stream.on('final_result', (data) => {
    console.log(`🎉 Final result: ${data.verdict} (${Math.round(data.confidence * 100)}%)`);
    console.log(`📊 Sources: ${data.sources.successful}/${data.sources.total}`);
    process.exit(0);
  });
  
  stream.on('error', (data) => {
    console.error('❌ Stream error:', data.error);
    process.exit(1);
  });
  
  // Timeout after 30 seconds
  setTimeout(() => {
    console.error('❌ Test timed out after 30 seconds');
    process.exit(1);
  }, 30000);
}

testStreaming().catch(console.error);