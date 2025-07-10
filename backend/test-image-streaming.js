#!/usr/bin/env node

/**
 * Test script to verify image streaming functionality
 */
const WebSocket = require('ws');
const fs = require('fs');

console.log('🧪 Testing image streaming functionality...');

// Read the zuck.png file
const imagePath = '/Users/will/zuck.png';
let imageBuffer;

try {
    imageBuffer = fs.readFileSync(imagePath);
    console.log(`📷 Loaded image: ${imagePath} (${imageBuffer.length} bytes)`);
} catch (error) {
    console.error('❌ Failed to load image:', error.message);
    process.exit(1);
}

// Convert to base64 data URL
const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
console.log(`🔄 Converted to base64 (${base64Image.length} chars)`);

// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3001/ws/verification');

ws.on('open', () => {
    console.log('🔗 WebSocket connected');
    
    // Send image verification request
    const message = {
        type: 'start_image_verification',
        imageBuffer: base64Image,
        filename: 'zuck.png',
        options: {
            test: true
        }
    };
    
    console.log('📤 Sending image verification request...');
    ws.send(JSON.stringify(message));
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        console.log(`📥 Received: ${message.type}`);
        
        switch (message.type) {
            case 'verification_started':
                console.log(`✅ Verification started - StreamID: ${message.streamId}`);
                console.log(`   Verdict: ${message.verdict}, Confidence: ${message.confidence}`);
                break;
                
            case 'progress':
                console.log(`⏳ Progress: ${message.message} (${message.progress}%)`);
                break;
                
            case 'final_result':
                console.log('🎯 Final Result:');
                console.log(`   Verdict: ${message.verdict}`);
                console.log(`   Confidence: ${message.confidence}`);
                console.log(`   Sources: ${message.sources?.traditional || 0} traditional, ${message.sources?.mcp || 0} MCP`);
                
                if (message.explanation?.details) {
                    console.log('   Findings:');
                    message.explanation.details.forEach((detail, i) => {
                        console.log(`     ${i + 1}. ${detail}`);
                    });
                }
                break;
                
            case 'complete':
                console.log('✅ Verification complete!');
                console.log('🏁 Test passed - Image streaming is working!');
                ws.close();
                process.exit(0);
                break;
                
            case 'error':
                console.error('❌ Verification error:', message.message);
                ws.close();
                process.exit(1);
                break;
                
            default:
                console.log(`📋 Other message: ${JSON.stringify(message, null, 2)}`);
        }
    } catch (error) {
        console.error('❌ Failed to parse message:', error.message);
        console.log('Raw message:', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log('⏰ Test timed out');
    ws.close();
    process.exit(1);
}, 30000);