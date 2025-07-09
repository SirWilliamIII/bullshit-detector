/**
 * Test script for the real-time verification system
 */
require('dotenv').config();

const VerificationEngine = require('./services/verification/VerificationEngine');

async function testVerificationSystem() {
  console.log('🔍 Testing real-time verification system...');
  
  try {
    // Initialize verification engine
    const engine = new VerificationEngine();
    await engine.initialize();
    
    // Test iPhone 16 claim
    console.log('\n📱 Testing iPhone 16 claim...');
    const result = await engine.verify('Apple just announced the iPhone 16 with revolutionary AI features');
    
    console.log('✅ Verification result:');
    console.log('Verdict:', result.verdict);
    console.log('Confidence:', result.confidence);
    console.log('Success:', result.success);
    if (result.sources && result.sources.results) {
      console.log('Sources used:', result.sources.results.map(s => s.source));
    }
    if (result.explanation) {
      console.log('Explanation:', result.explanation.summary);
    }
    if (result.error) {
      console.log('Error:', result.error);
    }
    
    // Test a scam claim
    console.log('\n🚨 Testing scam claim...');
    const scamResult = await engine.verify('Congratulations! You have won a free iPhone 16! Click here to claim your prize now before it expires!');
    
    console.log('✅ Scam verification result:');
    console.log('Verdict:', scamResult.verdict);
    console.log('Confidence:', scamResult.confidence);
    console.log('Sources used:', scamResult.sources.results.map(s => s.source));
    console.log('Explanation:', scamResult.explanation.summary);
    
    // Cleanup
    await engine.cleanup();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testVerificationSystem().catch(console.error);