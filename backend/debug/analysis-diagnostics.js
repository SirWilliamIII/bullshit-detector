// backend/debug/analysis-diagnostic.js
const path = require('path');

// Import your actual analysis modules
const BullshitDetector = require('../BullshitDetectorIntegration.js');
const EnhancedOCR = require('../EnhancedOCRService.js');
// Alternative if you're using the other OCR file:
// const enhancedOCR = require('../enhancedOCR.js');

async function diagnoseAnalysisPipeline() {
    console.log('🔍 Analysis Pipeline Diagnosis');
    console.log('=' .repeat(50));
    
    // This is the text your OCR successfully extracted
    const extractedText = `Mail thinks this message is Junk Mail. Move to Inbox
MARK ZUCKERBERG £9Junk - Google August 24, 2018
Congratulations! You have won $850,000 USD from Facebook Inc.
Contact markzuckerberg014@gmail.com for your winning amount.`;
    
    console.log('📝 Extracted Text:');
    console.log('-'.repeat(30));
    console.log(extractedText);
    console.log('-'.repeat(30));
    
    console.log('\n🔍 Running Analysis Pipeline...\n');
    
    try {
        // STEP 1: Test your actual analysis functions
        console.log('🧪 STEP 1: Testing Actual Analysis Functions');
        console.log('-'.repeat(40));
        
        try {
            // Test your actual classes
            const { BullshitDetectorOCRIntegration, BullshitDetectorAPI } = BullshitDetector;
            
            console.log('🔍 Testing BullshitDetectorAPI...');
            if (BullshitDetectorAPI) {
                const detector = new BullshitDetectorAPI();
                
                // Check what methods are available
                console.log('📋 BullshitDetectorAPI methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(detector)));
                
                // Try common method names
                if (typeof detector.analyze === 'function') {
                    const result = await detector.analyze(extractedText);
                    console.log('✅ BullshitDetectorAPI.analyze() result:');
                    console.log(JSON.stringify(result, null, 2));
                } else if (typeof detector.detectBullshit === 'function') {
                    const result = await detector.detectBullshit(extractedText);
                    console.log('✅ BullshitDetectorAPI.detectBullshit() result:');
                    console.log(JSON.stringify(result, null, 2));
                } else if (typeof detector.verify === 'function') {
                    const result = await detector.verify(extractedText);
                    console.log('✅ BullshitDetectorAPI.verify() result:');
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log('⚠️  No standard analysis method found');
                    console.log('📋 Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(detector)));
                }
            }
            
            console.log('\n🔍 Testing BullshitDetectorOCRIntegration...');
            if (BullshitDetectorOCRIntegration) {
                const ocrIntegration = new BullshitDetectorOCRIntegration();
                console.log('📋 OCRIntegration methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(ocrIntegration)));
                
                // This should be the method that handles image → text → analysis
                if (typeof ocrIntegration.analyzeImage === 'function') {
                    console.log('✅ Found analyzeImage() method - this is probably what you need for images');
                } else if (typeof ocrIntegration.processImage === 'function') {
                    console.log('✅ Found processImage() method');
                } else {
                    console.log('⚠️  No image processing method found');
                }
            }
            
        } catch (moduleError) {
            console.log('❌ Module testing failed:', moduleError.message);
            console.log('📋 Error details:', moduleError.stack);
        }
        
        // STEP 2: Manual pattern detection to verify what SHOULD work
        console.log('\n🎯 STEP 2: Expected Pattern Detections');
        console.log('-'.repeat(40));
        
        const patterns = {
            authority: {
                pattern: /MARK ZUCKERBERG/i,
                description: 'Authority impersonation (Facebook CEO)'
            },
            gmail: {
                pattern: /markzuckerberg014@gmail\.com/i,
                description: 'Suspicious Gmail usage by authority figure'
            },
            money: {
                pattern: /\$[\d,]+/,
                description: 'Financial lure amount'
            },
            lottery: {
                pattern: /you have won/i,
                description: 'Classic lottery scam language'
            },
            congratulations: {
                pattern: /congratulations/i,
                description: 'Emotional manipulation opener'
            },
            contact: {
                pattern: /contact.*@.*\.com/i,
                description: 'Contact request via suspicious email'
            }
        };
        
        let detectedPatterns = 0;
        const detectionResults = {};
        
        for (const [key, { pattern, description }] of Object.entries(patterns)) {
            const match = pattern.test(extractedText);
            detectionResults[key] = match;
            
            if (match) {
                console.log(`✅ ${key.toUpperCase()}: ${description}`);
                detectedPatterns++;
            } else {
                console.log(`❌ ${key.toUpperCase()}: ${description} (NOT DETECTED)`);
            }
        }
        
        // STEP 3: Tier analysis simulation
        console.log('\n🏗️  STEP 3: Tier Analysis Simulation');
        console.log('-'.repeat(40));
        
        // Tier 1: Government/Authority verification
        console.log('📊 Tier 1 (Authority Sources):');
        if (detectionResults.authority && detectionResults.gmail) {
            console.log('  🚨 CONFIRMED_FRAUD: Facebook CEO would never use Gmail for official business');
            console.log('  📋 Source: Corporate communication standards');
        } else {
            console.log('  ⚪ No Tier 1 violations detected');
        }
        
        // Tier 2: Complaint databases
        console.log('\n📊 Tier 2 (Complaint Sources):');
        console.log('  ⚪ Would check: BBB, FTC complaints, etc.');
        console.log('  📝 Note: Requires actual API integration');
        
        // Tier 3: Pattern matching
        console.log('\n📊 Tier 3 (Pattern Recognition):');
        if (detectedPatterns >= 3) {
            console.log(`  🚨 STRONG_PATTERN_MATCH: ${detectedPatterns}/6 scam indicators detected`);
            console.log('  📈 Pattern confidence: HIGH');
        } else {
            console.log(`  ⚪ Weak pattern match: ${detectedPatterns}/6 indicators`);
        }
        
        // Tier 4: Behavioral analysis
        console.log('\n📊 Tier 4 (Behavioral Analysis):');
        const urgencyWords = /urgent|immediate|expires|limited time|act now/i.test(extractedText);
        const emotionalHooks = /congratulations|winner|selected|lucky/i.test(extractedText);
        
        console.log(`  ${urgencyWords ? '🚨' : '⚪'} Urgency language: ${urgencyWords}`);
        console.log(`  ${emotionalHooks ? '🚨' : '⚪'} Emotional manipulation: ${emotionalHooks}`);
        
        // STEP 4: Final verdict simulation
        console.log('\n🎯 STEP 4: Final Verdict');
        console.log('='.repeat(40));
        
        const hasHighConfidenceScamIndicators = (
            detectionResults.authority && 
            detectionResults.gmail && 
            detectionResults.money && 
            detectionResults.lottery
        );
        
        if (hasHighConfidenceScamIndicators) {
            console.log('🚨 VERDICT: DEFINITE_SCAM');
            console.log('📊 Confidence: 95%+');
            console.log('🔗 Reasoning:');
            console.log('   • Authority impersonation (Mark Zuckerberg)');
            console.log('   • Implausible communication method (CEO using Gmail)');
            console.log('   • Classic lottery scam pattern');
            console.log('   • Suspicious contact method');
            console.log('\n💡 Recommendations:');
            console.log('   • Delete immediately');
            console.log('   • Report to FTC');
            console.log('   • Block sender');
        } else {
            console.log('⚪ VERDICT: Insufficient evidence for high-confidence determination');
        }
        
    } catch (error) {
        console.error('❌ Analysis Pipeline Failed:', error.message);
        console.error('🔧 Stack trace:', error.stack);
        
        console.log('\n🛠️  Debugging Steps:');
        console.log('1. Check if analysis modules are properly imported');
        console.log('2. Verify module paths are correct');
        console.log('3. Ensure all dependencies are installed');
        console.log('4. Test individual functions in isolation');
    }
}

console.log('🚀 Starting Analysis Pipeline Diagnosis...\n');
diagnoseAnalysisPipeline().catch(console.error);