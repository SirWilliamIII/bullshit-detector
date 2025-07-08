const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
// backend/debug/ocr-diagnostic.js
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function diagnoseOCRPipeline(imagePath) {
    console.log('🔍 OCR Pipeline Diagnosis');
    console.log(`Testing image: ${imagePath}`);
    
    // Check if image exists
    if (!fs.existsSync(imagePath)) {
        console.log(`❌ Image not found: ${imagePath}`);
        return;
    }
}

async function diagnoseOCRPipeline(imagePath) {
    console.log('🔍 OCR Pipeline Diagnosis');
    
    // 1. Can we load the image?
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = await sharp(imageBuffer).metadata();
        console.log(`✅ Image loaded: ${metadata.width}x${metadata.height}, ${metadata.format}`);
    } catch (e) {
        console.log(`❌ Image loading failed: ${e.message}`);
        return;
    }
    
    // 2. Basic Tesseract attempt
    try {
        const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
        console.log(`✅ Basic OCR extracted: '${text.substring(0, 100)}...'`);
        console.log(`   Character count: ${text.length}`);
        console.log(`   Word count: ${text.split(/\s+/).length}`);
    } catch (e) {
        console.log(`❌ Basic OCR failed: ${e.message}`);
    }
    
    // 3. Try with preprocessing
    try {
        const processedBuffer = await sharp(imagePath)
            .greyscale()
            .normalize()
            .sharpen()
            .png()
            .toBuffer();
            
        const { data: { text } } = await Tesseract.recognize(processedBuffer, 'eng', {
            logger: m => console.log(m.status, m.progress)
        });
        
        console.log(`✅ Processed OCR extracted: '${text.substring(0, 100)}...'`);
        console.log(`   Character count: ${text.length}`);
    } catch (e) {
        console.log(`❌ Processed OCR failed: ${e.message}`);
    }
}

// Test with your problem image
diagnoseOCRPipeline('/Users/will/Programming/bullshit-detector/zuck.png');

