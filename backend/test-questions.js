const FallbackStreamingEngine = require('./services/streaming/FallbackStreamingEngine');

async function testFollowUpQuestions() {
  console.log('🧪 Testing follow-up questions generation...');
  
  const engine = new FallbackStreamingEngine();
  await engine.initialize();
  
  // Test with a suspicious message that should trigger questions
  const { streamId, stream } = await engine.startStreamingVerification(
    'I won a free iPhone from apple-rewards@gmail.com, just need to pay $50 shipping'
  );
  
  console.log('Stream ID:', streamId);
  
  stream.on('follow_up_questions', (data) => {
    console.log('📋 Follow-up questions generated:');
    console.log('Confidence:', Math.round(data.questions.confidenceLevel * 100) + '%');
    console.log('Uncertainty Level:', data.questions.uncertaintyLevel);
    console.log('Explanation:', data.questions.explanation);
    console.log('\nQuestions:');
    
    data.questions.questions.forEach((q, i) => {
      console.log(`  ${i+1}. ${q.question}`);
      console.log(`     Weight: ${q.weight} | Category: ${q.category}`);
      if (q.type === 'multiple_choice') {
        q.options.forEach(opt => {
          console.log(`     - ${opt.label} (${opt.risk} risk)`);
        });
      }
      if (q.followUp) {
        console.log(`     Follow-up: ${JSON.stringify(q.followUp)}`);
      }
      console.log('');
    });
    
    process.exit(0);
  });
  
  stream.on('final_result', (data) => {
    console.log('Final result - confidence:', Math.round(data.confidence * 100) + '%');
    if (!data.followUpQuestions) {
      console.log('No follow-up questions generated (confidence too high)');
    }
    process.exit(0);
  });
  
  stream.on('error', (error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

testFollowUpQuestions().catch(console.error);