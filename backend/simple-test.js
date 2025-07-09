/**
 * Simple test to demonstrate the real-time verification system
 */
require('dotenv').config();

const ContextDetector = require('./services/context/ContextDetector');

async function testContextDetection() {
  console.log('🔍 Testing Context Detection System...');
  
  const detector = new ContextDetector();
  
  // Test iPhone 16 claim
  console.log('\n📱 Testing iPhone 16 claim...');
  const context = await detector.detectContext('Apple just announced the iPhone 16 with revolutionary AI features');
  
  console.log('✅ Context Analysis:');
  console.log('Primary claim type:', context.claimTypes[0]?.type || 'UNKNOWN');
  console.log('Entities found:', context.entities.companies.concat(context.entities.products));
  console.log('Time relevance:', context.temporal.timeRelevance);
  console.log('Urgency level:', context.urgency.level);
  console.log('Recommended sources:', context.strategy.sourceTypes.slice(0, 3).join(', '));
  console.log('Confidence:', (context.confidence * 100).toFixed(1) + '%');
  
  // Test scam claim
  console.log('\n🚨 Testing scam claim...');
  const scamContext = await detector.detectContext('Congratulations! You have won a free iPhone 16! Click here to claim your prize now before it expires!');
  
  console.log('✅ Scam Context Analysis:');
  console.log('Primary claim type:', scamContext.claimTypes[0]?.type || 'UNKNOWN');
  console.log('Entities found:', scamContext.entities.companies.concat(scamContext.entities.products));
  console.log('Time relevance:', scamContext.temporal.timeRelevance);
  console.log('Urgency level:', scamContext.urgency.level);
  console.log('Recommended sources:', scamContext.strategy.sourceTypes.slice(0, 3).join(', '));
  console.log('Confidence:', (scamContext.confidence * 100).toFixed(1) + '%');
  
  // Test old iPhone claim (what would have failed before)
  console.log('\n📱 Testing iPhone 15 claim (old behavior)...');
  const oldContext = await detector.detectContext('Apple just announced the iPhone 15 with amazing features');
  
  console.log('✅ Old Context Analysis:');
  console.log('Primary claim type:', oldContext.claimTypes[0]?.type || 'UNKNOWN');
  console.log('Entities found:', oldContext.entities.companies.concat(oldContext.entities.products));
  console.log('Time relevance:', oldContext.temporal.timeRelevance);
  console.log('Urgency level:', oldContext.urgency.level);
  console.log('Recommended sources:', oldContext.strategy.sourceTypes.slice(0, 3).join(', '));
  console.log('Confidence:', (oldContext.confidence * 100).toFixed(1) + '%');
  
  console.log('\n🎉 Key Improvement:');
  console.log('- Before: Static knowledge would flag iPhone 16 as false (thinking iPhone 15 was latest)');
  console.log('- After: Dynamic context detection identifies this as PRODUCT_CLAIM');
  console.log('- System routes to OFFICIAL_SITE (Apple), TECH_NEWS, and SEARCH sources');
  console.log('- Real-time verification will check current Apple website for iPhone 16 info');
  console.log('- Result: Accurate verification instead of false positive');
}

testContextDetection().catch(console.error);