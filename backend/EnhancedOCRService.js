// Enhanced OCR Service for Bullshit Detector
// Implements multi-engine fallback with confidence scoring

const { createWorker, createScheduler, PSM } = require("tesseract.js");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");

class EnhancedOCRService {
  constructor() {
    this.scheduler = null;
    this.workers = [];
    this.isInitialized = false;
    this.scamPatterns = this.initializeScamPatterns();
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log("Initializing Enhanced OCR Service...");

    this.scheduler = createScheduler();

    const workerConfigs = [
      { psm: PSM.AUTO, config: "primary" },
      { psm: PSM.SINGLE_BLOCK, config: "single_block" },
      { psm: PSM.SINGLE_WORD, config: "single_word" },
    ];

    for (const { psm, config } of workerConfigs) {
      try {
        const worker = await createWorker("eng", 1, {
          logger: (m) => this.logProgress(m, config),
          cacheMethod: "write",
        });

        await worker.setParameters({
          tessedit_pageseg_mode: psm,
        });

        this.workers.push({ worker, config });
        this.scheduler.addWorker(worker);
        console.log(`Worker ${config} initialized successfully`);
      } catch (err) {
        console.error(`Failed to initialize worker ${config}:`, err);
      }
    }

    this.isInitialized = true;
    console.log(`OCR Service initialized with ${this.workers.length} workers`);
  }

  async extractTextWithFallback(imagePath) {
    if (!this.isInitialized) await this.initialize();

    const start = Date.now();
    console.log(`Starting OCR extraction for: ${imagePath}`);

    try {
      const processed = await this.preprocessImage(imagePath).catch((err) => {
        console.error("Preprocessing error:", err);
        return imagePath;
      });

      const strategies = [
        { name: "full_image", fn: this.recognizeFullImage.bind(this) },
        { name: "email_regions", fn: this.recognizeEmailRegions.bind(this) },
        {
          name: "scam_whitelist",
          fn: this.recognizeWithScamWhitelist.bind(this),
        },
      ];

      for (const { name, fn } of strategies) {
        try {
          console.log(`Attempting strategy: ${name}`);
          const res = await fn(processed);
          if (this.isConfidentResult(res)) {
            const analysis = await this.analyzeExtractedText(res.text);
            console.log(
              `OCR successful with ${name} in ${Date.now() - start}ms`,
            );
            return {
              ...analysis,
              ocrMetadata: {
                strategy: name,
                confidence: res.confidence,
                processingTime: Date.now() - start,
                imageProcessed: processed !== imagePath,
              },
            };
          }
        } catch (err) {
          console.log(`Strategy ${name} failed:`, err.message);
        }
      }

      return this.queueForManualReview(imagePath, "All OCR strategies failed");
    } catch (err) {
      console.error("OCR extraction failed:", err);
      return this.queueForManualReview(imagePath, err.message);
    } finally {
      await this.cleanup();
    }
  }

  async preprocessImage(imagePath) {
    try {
      const out = imagePath.replace(/\.(jpg|jpeg|png)$/i, "_processed.png");
      await sharp(imagePath)
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1.5 })
        .median(3)
        .gamma(2.2)
        .png({ quality: 100 })
        .toFile(out);

      console.log("Image preprocessed for better OCR");
      return out;
    } catch (err) {
      console.log("Image preprocessing failed, using original:", err.message);
      return imagePath;
    }
  }

  recognizeFullImage(imagePath) {
    console.log("Recognizing full image...");
    return this.scheduler.addJob("recognize", imagePath).then((job) => ({
      text: job.data.text,
      confidence: job.data.confidence,
      method: "full_image",
    }));
  }

  async recognizeEmailRegions(imagePath) {
    console.log("Recognizing email regions...");
    const regions = [
      { name: "header", left: 0, top: 0, width: 800, height: 200 },
      { name: "body", left: 0, top: 200, width: 800, height: 400 },
      { name: "footer", left: 0, top: 600, width: 800, height: 100 },
    ];

    const texts = [];
    for (const r of regions) {
      try {
        const job = await this.scheduler.addJob("recognize", imagePath, {
          rectangle: r,
        });
        if (job.data.text.trim()) {
          texts.push({
            region: r.name,
            text: job.data.text,
            confidence: job.data.confidence,
          });
        }
      } catch (err) {
        console.log(`Region ${r.name} failed:`, err.message);
      }
    }

    const combined = texts.map((t) => t.text).join("\n");
    const avgConf = texts.reduce((s, t) => s + t.confidence, 0) / texts.length;
    return {
      text: combined,
      confidence: avgConf,
      method: "email_regions",
      regions: texts,
    };
  }

  async recognizeWithScamWhitelist(imagePath) {
    console.log("Recognizing with scam-focused whitelist...");
    const scamWorker = await createWorker("eng");
    try {
      await scamWorker.setParameters({
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!@#$%^&*()_+-=[]{}|;:'\"<>?/~`",
        tessedit_pageseg_mode: PSM.AUTO_OSD,
      });
      const res = await scamWorker.recognize(imagePath);
      return {
        text: res.data.text,
        confidence: res.data.confidence,
        method: "scam_whitelist",
      };
    } finally {
      await scamWorker.terminate();
    }
  }

  isConfidentResult(res) {
    const textOK = res.text?.trim().length > 15;
    const confOK = res.confidence > 60;
    const structOK = this.hasReadableStructure(res.text);
    console.log(
      `Confidence check: text=${textOK}, confidence=${confOK} (${res.confidence}), structure=${structOK}`,
    );
    return textOK && confOK && structOK;
  }

  hasReadableStructure(text) {
    if (!text) return false;
    const words = text.trim().split(/\s+/).length;
    const letters = /[a-zA-Z]/.test(text);
    const symbolsRatio =
      text.replace(/[^a-zA-Z0-9\s]/g, "").length / text.length;
    return words >= 3 && letters && symbolsRatio > 0.3;
  }

  async analyzeExtractedText(text) {
    console.log("Analyzing extracted text for scam patterns...");
    const scamCount = this.detectScamPatterns(text);
    const authCount = this.checkAuthorityImpersonation(text);
    const moneyCount = this.detectFinancialLures(text);
    const urgCount = this.detectUrgencyLanguage(text);

    const total = scamCount + authCount + moneyCount + urgCount;
    let verdict, confidence;

    if (total >= 3) {
      verdict = "DEFINITE_SCAM";
      confidence = Math.min(0.95, 0.7 + total * 0.08);
    } else if (total >= 2) {
      verdict = "LIKELY_SCAM";
      confidence = 0.6 + total * 0.1;
    } else if (total >= 1) {
      verdict = "SUSPICIOUS";
      confidence = 0.4 + total * 0.1;
    } else {
      verdict = "NEEDS_VERIFICATION";
      confidence = 0.2;
    }

    return {
      text,
      verdict,
      confidence,
      evidence: { scamCount, authCount, moneyCount, urgCount, total },
      recommendations: this.generateRecommendations(verdict, text),
    };
  }

  detectScamPatterns(text) {
    const phrases = [
      "congratulations",
      "you have won",
      "claim your prize",
      "limited time offer",
      "act now",
      "verify your account",
      "suspended account",
      "urgent action required",
      "click here immediately",
    ];
    return phrases.reduce(
      (cnt, p) => cnt + (new RegExp(`\\b${p}\\b`, "gi").test(text) ? 1 : 0),
      0,
    );
  }

  checkAuthorityImpersonation(text) {
    const auths = [
      "irs",
      "social security",
      "microsoft",
      "apple",
      "google",
      "amazon",
      "paypal",
      "bank of america",
      "chase",
      "wells fargo",
      "fbi",
      "police",
      "government",
      "ceo",
      "director",
      "president",
    ];
    let cnt = 0;

    if (/mark zuckerberg/i.test(text) && /facebook/i.test(text)) {
      cnt += 2;
      console.log("Authority impersonation: Zuckerberg/Facebook");
    }

    for (const a of auths) {
      if (new RegExp(`\\b${a}\\b`, "i").test(text)) {
        cnt++;
        console.log(`Authority impersonation: ${a}`);
      }
    }

    return cnt;
  }

  detectFinancialLures(text) {
    const patterns = [
      /\$[\d,]+/g,
      /\d+\s*(million|billion)/gi,
      /inheritance/gi,
      /refund/gi,
      /compensation/gi,
      /winning.*amount/gi,
      /lottery/gi,
      /jackpot/gi,
    ];
    return patterns.reduce((cnt, pat) => {
      const m = text.match(pat);
      if (m) {
        console.log(`Financial lure detected: ${m.join(", ")}`);
        return cnt + m.length;
      }
      return cnt;
    }, 0);
  }

  detectUrgencyLanguage(text) {
    const words = [
      "urgent",
      "immediate",
      "expires today",
      "act now",
      "limited time",
      "hurry",
      "deadline",
      "before it's too late",
    ];
    return words.reduce((cnt, w) => {
      if (text.toLowerCase().includes(w)) {
        console.log(`Urgency word detected: ${w}`);
        return cnt + 1;
      }
      return cnt;
    }, 0);
  }

  generateRecommendations(verdict, text) {
    const recs = [];
    if (verdict === "DEFINITE_SCAM") {
      recs.push("🚨 DO NOT respond");
      recs.push("🚨 DO NOT click any links");
      recs.push("🚨 DO NOT provide personal info");
      recs.push("Report to authorities");
    } else if (verdict === "LIKELY_SCAM") {
      recs.push("⚠️ Highly suspicious—verify independently");
      recs.push("⚠️ Contact the organization directly");
      recs.push("⚠️ Don’t use contact info from this message");
    } else if (verdict === "SUSPICIOUS") {
      recs.push("🔍 Verify independently before acting");
      recs.push("🔍 Check with the claimed organization");
      recs.push("🔍 Be cautious with personal info");
    }
    if (/gmail\.com/i.test(text) && /ceo/i.test(text)) {
      recs.push("❌ Real CEOs don’t use Gmail for official business");
    }
    return recs;
  }

  async queueForManualReview(imagePath, reason) {
    console.log(`Queuing for manual review: ${reason}`);
    return {
      text: null,
      verdict: "MANUAL_REVIEW_NEEDED",
      confidence: 0,
      evidence: { reason, imagePath, timestamp: new Date().toISOString() },
      recommendations: [
        "🔍 OCR failed—manual review required",
        "🔍 Please describe what you see",
        "🔍 Look for sender email, urgency, money requests",
      ],
    };
  }

  logProgress(m, cfg) {
    if (m.status === "recognizing text") {
      console.log(`OCR Progress [${cfg}]: ${Math.round(m.progress * 100)}%`);
    }
  }

  initializeScamPatterns() {
    return {
      lottery: /lottery|won|prize|congratulations/gi,
      authority: /irs|government|bank|microsoft|apple/gi,
      urgency: /urgent|immediate|expires|deadline/gi,
      financial: /\$[\d,]+|million|inheritance|refund/gi,
    };
  }

  async cleanup() {
    // Clean up any temporary processed images, if needed.
  }

  async terminate() {
    if (this.scheduler) await this.scheduler.terminate();
    for (const { worker } of this.workers) {
      try {
        await worker.terminate();
      } catch (err) {
        console.error("Error terminating worker:", err);
      }
    }
    this.isInitialized = false;
    console.log("OCR Service terminated");
  }
}

module.exports = EnhancedOCRService;
