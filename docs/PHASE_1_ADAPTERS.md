# GIAI ĐOẠN 1: Adapters & External Services

**Thời gian:** 2 tuần  
**Mục tiêu:** Chuyển tất cả adapters từ stub sang REAL mode với error handling, retry, monitoring đầy đủ

---

## Tổng quan

Giai đoạn này tập trung vào việc triển khai đầy đủ các adapters kết nối với dịch vụ bên ngoài. Mỗi adapter phải:
- Hoạt động ở REAL mode (loại bỏ stub)
- Có error handling comprehensive
- Implement retry logic với exponential backoff
- Có timeout cho mọi external calls
- Log đầy đủ cho debugging & monitoring
- Có unit tests với coverage ≥ 85%

---

## 1. LLM Adapter (Google Gemini API)

### 1.1. Tình trạng hiện tại
- ✅ Có cấu trúc cơ bản với `callGeminiJSON()` và `generateQuestions()`
- ✅ Hỗ trợ retry logic (2 retries)
- ⚠️ Còn chế độ stub (kiểm tra `LLM_MODE`)
- ⚠️ Timeout cố định (30s), không configurable
- ⚠️ Chưa có cost tracking
- ⚠️ Chưa có caching mechanism
- ⚠️ Chưa hỗ trợ đầy đủ các API calls (chỉ có generateQuestions)

### 1.2. Cần triển khai

#### A. API Methods bổ sung
Theo SRS/SDD, LLM cần hỗ trợ:

```javascript
// src/adapters/llmClient.js

class LLMClient {
  // ✅ Đã có
  async generateQuestions(input) { ... }

  // 🔴 CẦN THÊM
  /**
   * Generate table of contents from document text
   * @param {Object} input - { documentText, existingToC? }
   * @returns {Object} { tableOfContents: Array<{topicId, topicName, childTopics}> }
   */
  async generateTableOfContents(input) {
    // Prompt engineering cho ToC generation
    // Parse structured output (nested topics)
    // Validate output structure
  }

  /**
   * Generate summary (short & full) from document text
   * @param {Object} input - { documentText, summaryType: 'short'|'full' }
   * @returns {Object} { summary: string }
   */
  async generateSummary(input) {
    // Prompt engineering cho summary
    // Handle both short (1-2 paragraphs) and full (detailed) summaries
  }

  /**
   * Generate explanations for quiz questions
   * @param {Object} input - { question, correctAnswer, userAnswer, context }
   * @returns {Object} { explanation: string }
   */
  async generateExplanation(input) {
    // Generate personalized explanations based on user's incorrect answer
  }
}
```

#### B. Error Handling nâng cao

```javascript
class LLMClient {
  async callGeminiJSON(prompt) {
    const { apiKey, timeoutMs, retries, maxRetries } = this.config;
    
    // 🔴 CẦN THÊM: Validate inputs
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Invalid prompt');
    }
    if (!apiKey) {
      throw new Error('LLM API key not configured');
    }

    let lastErr;
    const maxAttempts = maxRetries || retries || 2;
    
    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      try {
        // 🔴 CẦN THÊM: Request ID for tracking
        const requestId = `llm-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        // 🔴 CẦN THÊM: Log request (với truncated prompt)
        logger.info({ 
          requestId, 
          attempt, 
          promptLength: prompt.length,
          model: this.config.model 
        }, 'LLM request started');

        const startTime = Date.now();
        const res = await axios.post(url, body, { 
          timeout: timeoutMs || 30000,
          headers: {
            'X-Request-ID': requestId
          }
        });
        const duration = Date.now() - startTime;

        // 🔴 CẦN THÊM: Log response metrics
        logger.info({ 
          requestId, 
          duration, 
          status: res.status,
          tokensUsed: res.data?.usageMetadata?.totalTokenCount 
        }, 'LLM request completed');

        // 🔴 CẦN THÊM: Track costs (if available in response)
        this.trackCost(res.data?.usageMetadata);

        const cand = res?.data?.candidates?.[0];
        
        // 🔴 CẦN THÊM: Handle safety blocks
        if (cand?.finishReason === 'SAFETY') {
          throw new Error('Content blocked by safety filters');
        }
        if (cand?.finishReason === 'RECITATION') {
          throw new Error('Content blocked due to recitation');
        }

        const text = cand?.content?.parts?.[0]?.text || "{}";
        return LLMClient.parseJsonFromText(text);
        
      } catch (e) {
        // 🔴 CẦN THÊM: Classify errors
        const isRetryable = this.isRetryableError(e);
        const errorType = this.classifyError(e);
        
        logger.error({ 
          attempt, 
          error: e.message, 
          errorType,
          isRetryable,
          statusCode: e?.response?.status 
        }, 'LLM request failed');

        lastErr = e;
        
        // 🔴 CẦN THÊM: Exponential backoff with jitter
        if (isRetryable && attempt < maxAttempts) {
          const backoffMs = this.calculateBackoff(attempt);
          await sleep(backoffMs);
        } else {
          break; // Don't retry non-retryable errors
        }
      }
    }
    
    // 🔴 CẦN THÊM: Wrap in standard error
    throw this.wrapLLMError(lastErr);
  }

  // 🔴 CẦN THÊM: Helper methods
  isRetryableError(error) {
    const status = error?.response?.status;
    // Retry on 5xx, 429 (rate limit), network errors
    return !status || status >= 500 || status === 429;
  }

  classifyError(error) {
    const status = error?.response?.status;
    if (!status) return 'NetworkError';
    if (status === 401 || status === 403) return 'AuthError';
    if (status === 429) return 'RateLimitError';
    if (status >= 500) return 'ServerError';
    if (status === 400) return 'InvalidRequest';
    return 'UnknownError';
  }

  calculateBackoff(attempt) {
    // Exponential backoff: 500ms, 1s, 2s, 4s, ...
    // With jitter to avoid thundering herd
    const baseMs = 500 * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * baseMs; // ±30% jitter
    return baseMs + jitter;
  }

  wrapLLMError(originalError) {
    const errorType = this.classifyError(originalError);
    const err = new Error(originalError.message || 'LLM request failed');
    err.code = errorType;
    err.status = originalError?.response?.status || 502;
    err.originalError = originalError;
    return err;
  }

  // 🔴 CẦN THÊM: Cost tracking
  trackCost(usageMetadata) {
    if (!usageMetadata) return;
    
    const { totalTokenCount, promptTokenCount, candidatesTokenCount } = usageMetadata;
    
    // Log to metrics/monitoring system
    // Could also write to DB for billing
    logger.info({
      totalTokens: totalTokenCount,
      promptTokens: promptTokenCount,
      completionTokens: candidatesTokenCount,
      estimatedCostUSD: this.estimateCost(totalTokenCount)
    }, 'LLM usage tracked');
  }

  estimateCost(totalTokens) {
    // Gemini 1.5 Flash pricing (example, check actual pricing)
    // ~$0.00001875 per 1K tokens (blended rate)
    return (totalTokens / 1000) * 0.00001875;
  }
}
```

#### C. Caching mechanism

```javascript
// 🔴 CẦN THÊM: src/adapters/llmCache.js
const { getRedisClient } = require('../config/redis');

class LLMCache {
  constructor() {
    this.redis = getRedisClient();
    this.ttl = 3600; // 1 hour default
  }

  async get(cacheKey) {
    if (!this.redis) return null;
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      logger.warn({ error: e.message }, 'Cache get failed');
      return null;
    }
  }

  async set(cacheKey, value, ttlSeconds) {
    if (!this.redis) return;
    try {
      await this.redis.setex(
        cacheKey, 
        ttlSeconds || this.ttl, 
        JSON.stringify(value)
      );
    } catch (e) {
      logger.warn({ error: e.message }, 'Cache set failed');
    }
  }

  buildKey(prefix, input) {
    // Create deterministic cache key from input
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex')
      .substring(0, 16);
    return `llm:${prefix}:${hash}`;
  }
}

// Update LLMClient to use cache
class LLMClient {
  constructor(config) {
    this.config = config;
    this.cache = new LLMCache();
  }

  async generateQuestions(input) {
    // 🔴 CẦN THÊM: Check cache first
    const cacheKey = this.cache.buildKey('questions', input);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, 'LLM cache hit');
      return cached;
    }

    // Proceed with actual API call...
    const result = await this.callGeminiJSON(prompt);
    
    // 🔴 CẦN THÊM: Cache result
    await this.cache.set(cacheKey, result, 3600); // 1 hour
    
    return result;
  }
}
```

#### D. Configuration improvements

```javascript
// 🔴 CẦN THÊM: src/config/llm.js
const env = require('./env');

module.exports = {
  provider: 'gemini', // Could support 'openai', 'claude' in future
  gemini: {
    apiKey: env.geminiApiKey,
    model: env.geminiModel || 'gemini-1.5-flash',
    timeoutMs: parseInt(env.geminiTimeoutMs || '30000', 10),
    maxRetries: parseInt(env.geminiMaxRetries || '3', 10),
    // Rate limiting
    maxRequestsPerMinute: parseInt(env.geminiMaxRpm || '60', 10),
    // Cost limits
    maxCostPerDayUSD: parseFloat(env.geminiMaxCostPerDay || '10.0'),
  },
  // Feature flags
  enableCaching: env.llmCacheEnabled !== 'false',
  enableCostTracking: env.llmCostTrackingEnabled !== 'false',
  // Prompt templates directory
  promptTemplatesDir: env.llmPromptTemplatesDir || './prompts',
};
```

```javascript
// 🔴 CẦN THÊM: Trong env.js
geminiApiKey: process.env.GEMINI_API_KEY || '',
geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
geminiTimeoutMs: process.env.GEMINI_TIMEOUT_MS || '30000',
geminiMaxRetries: process.env.GEMINI_MAX_RETRIES || '3',
geminiMaxRpm: process.env.GEMINI_MAX_RPM || '60',
geminiMaxCostPerDay: process.env.GEMINI_MAX_COST_PER_DAY || '10.0',
llmCacheEnabled: process.env.LLM_CACHE_ENABLED || 'true',
llmCostTrackingEnabled: process.env.LLM_COST_TRACKING_ENABLED || 'true',
```

#### E. Rate limiting

```javascript
// 🔴 CẦN THÊM: src/adapters/llmRateLimiter.js
class LLMRateLimiter {
  constructor(maxRequestsPerMinute) {
    this.maxRpm = maxRequestsPerMinute;
    this.requests = [];
  }

  async waitIfNeeded() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old requests
    this.requests = this.requests.filter(t => t > oneMinuteAgo);
    
    if (this.requests.length >= this.maxRpm) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      const waitMs = oldestRequest + 60000 - now;
      
      if (waitMs > 0) {
        logger.info({ waitMs }, 'Rate limit reached, waiting');
        await sleep(waitMs);
      }
    }
    
    this.requests.push(now);
  }
}

// Add to LLMClient
class LLMClient {
  constructor(config) {
    this.config = config;
    this.cache = new LLMCache();
    this.rateLimiter = new LLMRateLimiter(config.maxRequestsPerMinute || 60);
  }

  async callGeminiJSON(prompt) {
    // 🔴 CẦN THÊM: Wait if rate limited
    await this.rateLimiter.waitIfNeeded();
    
    // ... rest of the method
  }
}
```

### 1.3. Testing requirements

```javascript
// 🔴 CẦN THÊM: tests/adapters/llmClient.test.js

describe('LLMClient', () => {
  describe('generateQuestions', () => {
    it('should generate questions from context', async () => {});
    it('should respect difficulty level', async () => {});
    it('should handle empty context gracefully', async () => {});
    it('should retry on transient errors', async () => {});
    it('should not retry on auth errors', async () => {});
    it('should use cache when available', async () => {});
    it('should track costs', async () => {});
  });

  describe('generateTableOfContents', () => {
    it('should generate nested ToC structure', async () => {});
    it('should handle long documents', async () => {});
  });

  describe('generateSummary', () => {
    it('should generate short summary', async () => {});
    it('should generate full summary', async () => {});
  });

  describe('error handling', () => {
    it('should wrap network errors correctly', async () => {});
    it('should handle rate limit errors', async () => {});
    it('should handle safety blocks', async () => {});
  });

  describe('rate limiting', () => {
    it('should throttle requests above RPM limit', async () => {});
  });
});
```

### 1.4. Checklist

- [ ] Remove `LLM_MODE` stub check, default to real
- [ ] Implement `generateTableOfContents()`
- [ ] Implement `generateSummary()`
- [ ] Implement `generateExplanation()`
- [ ] Add comprehensive error handling với classification
- [ ] Add retry logic với exponential backoff + jitter
- [ ] Add cost tracking và logging
- [ ] Add caching layer (Redis)
- [ ] Add rate limiting (client-side)
- [ ] Add detailed request/response logging
- [ ] Add timeout configuration
- [ ] Handle safety blocks và recitation blocks
- [ ] Unit tests coverage ≥ 85%
- [ ] Integration tests với Gemini API (test account)
- [ ] Documentation: API usage, error codes, cost estimation

---

## 2. Storage Adapter (S3/Cloudinary)

### 2.1. Tình trạng hiện tại
- ✅ Có cấu trúc cơ bản với local storage
- ⚠️ Chỉ hỗ trợ `STORAGE_MODE=local`
- ⚠️ Chưa có S3 hoặc Cloudinary integration
- ⚠️ Chưa có file validation (MIME type, size limits)
- ⚠️ Chưa có signed URLs
- ⚠️ Chưa có CDN support

### 2.2. Cần triển khai

#### A. S3 Integration

```javascript
// 🔴 CẦN THÊM: Install AWS SDK
// npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

// src/adapters/storageClient.js
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');
const logger = require('../utils/logger');

class StorageClient {
  constructor(config) {
    this.config = config;
    this.provider = config.provider || 'local'; // 'local' | 's3' | 'cloudinary'
    
    if (this.provider === 's3') {
      this.s3 = new S3Client({
        region: config.s3Region,
        credentials: {
          accessKeyId: config.s3AccessKey,
          secretAccessKey: config.s3SecretKey,
        },
      });
      this.bucket = config.s3Bucket;
    }
  }

  /**
   * Upload file to storage
   * @param {Object} file - Multer file object { buffer, originalname, mimetype, size }
   * @param {Object} options - { userId, subjectId, documentId }
   * @returns {Object} { storagePath, publicUrl?, size }
   */
  async upload(file, options = {}) {
    // 🔴 CẦN THÊM: Validate file
    this.validateFile(file);
    
    const { userId, subjectId, documentId } = options;
    
    if (this.provider === 's3') {
      return this.uploadToS3(file, { userId, subjectId, documentId });
    }
    
    if (this.provider === 'cloudinary') {
      return this.uploadToCloudinary(file, { userId, subjectId, documentId });
    }
    
    // Fallback to local (dev only)
    return this.uploadToLocal(file);
  }

  validateFile(file) {
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/plain',
    ];
    const allowedExtensions = ['.pdf', '.docx', '.txt'];
    const maxSizeMB = 20;

    if (!file || !file.buffer) {
      throw new Error('Invalid file object');
    }

    // Check MIME type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }

    // Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      throw new Error(`File extension ${ext} not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
    }

    // Check size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      throw new Error(`File size ${sizeMB.toFixed(2)}MB exceeds limit of ${maxSizeMB}MB`);
    }
  }

  async uploadToS3(file, { userId, subjectId, documentId }) {
    // Generate unique key
    const timestamp = Date.now();
    const randomStr = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    const sanitizedName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // Key structure: documents/{userId}/{subjectId}/{timestamp}_{random}_{name}.ext
    const key = `documents/${userId}/${subjectId}/${timestamp}_${randomStr}_${sanitizedName}${ext}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          userId: userId?.toString() || '',
          subjectId: subjectId?.toString() || '',
          documentId: documentId?.toString() || '',
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.s3.send(command);

      logger.info({
        key,
        bucket: this.bucket,
        size: file.size,
        mimetype: file.mimetype,
      }, 'File uploaded to S3');

      return {
        storagePath: key,
        publicUrl: await this.getSignedUrl(key, 3600), // 1 hour expiry for initial access
        size: file.size,
      };
    } catch (error) {
      logger.error({ error: error.message, key }, 'S3 upload failed');
      throw new Error(`Storage upload failed: ${error.message}`);
    }
  }

  async uploadToLocal(file) {
    const fs = require('fs').promises;
    const dir = path.resolve(process.cwd(), 'uploads');
    await fs.mkdir(dir, { recursive: true });
    
    const filename = `${Date.now()}_${file.originalname}`;
    const dest = path.join(dir, filename);
    
    await fs.writeFile(dest, file.buffer);
    
    return { storagePath: dest, size: file.size };
  }

  /**
   * Get signed URL for secure file access
   * @param {string} storagePath - S3 key or path
   * @param {number} expiresIn - Seconds until expiration
   * @returns {string} Signed URL
   */
  async getSignedUrl(storagePath, expiresIn = 3600) {
    if (this.provider === 's3') {
      try {
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        });
        
        const url = await getSignedUrl(this.s3, command, { expiresIn });
        return url;
      } catch (error) {
        logger.error({ error: error.message, storagePath }, 'Failed to generate signed URL');
        throw new Error('Failed to generate file access URL');
      }
    }
    
    if (this.provider === 'local') {
      return `file://${storagePath}`;
    }
    
    throw new Error('Unsupported storage provider');
  }

  /**
   * Delete file from storage
   * @param {string} storagePath - S3 key or path
   */
  async delete(storagePath) {
    if (this.provider === 's3') {
      try {
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        });
        
        await this.s3.send(command);
        logger.info({ storagePath }, 'File deleted from S3');
      } catch (error) {
        logger.error({ error: error.message, storagePath }, 'S3 delete failed');
        throw new Error(`Storage delete failed: ${error.message}`);
      }
    }
    
    if (this.provider === 'local') {
      const fs = require('fs').promises;
      await fs.unlink(storagePath);
    }
  }

  /**
   * Get file metadata
   * @param {string} storagePath - S3 key or path
   * @returns {Object} { size, contentType, lastModified }
   */
  async getMetadata(storagePath) {
    if (this.provider === 's3') {
      const { HeadObjectCommand } = require('@aws-sdk/client-s3');
      try {
        const command = new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        });
        
        const response = await this.s3.send(command);
        return {
          size: response.ContentLength,
          contentType: response.ContentType,
          lastModified: response.LastModified,
          metadata: response.Metadata,
        };
      } catch (error) {
        logger.error({ error: error.message, storagePath }, 'Failed to get S3 metadata');
        throw new Error('Failed to get file metadata');
      }
    }
    
    if (this.provider === 'local') {
      const fs = require('fs').promises;
      const stats = await fs.stat(storagePath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
      };
    }
    
    throw new Error('Unsupported storage provider');
  }
}

module.exports = StorageClient;
```

#### B. Cloudinary Integration (Alternative)

```javascript
// 🔴 CẦN THÊM: If choosing Cloudinary instead of S3
// npm install cloudinary

async uploadToCloudinary(file, { userId, subjectId, documentId }) {
  const cloudinary = require('cloudinary').v2;
  
  cloudinary.config({
    cloud_name: this.config.cloudinaryCloudName,
    api_key: this.config.cloudinaryApiKey,
    api_secret: this.config.cloudinaryApiSecret,
  });

  // Upload as raw file (not image)
  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: `learinal/documents/${userId}/${subjectId}`,
        public_id: `${Date.now()}_${path.basename(file.originalname)}`,
        context: {
          userId,
          subjectId,
          documentId,
          originalName: file.originalname,
        },
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    
    uploadStream.end(file.buffer);
  });

  return {
    storagePath: result.public_id,
    publicUrl: result.secure_url,
    size: result.bytes,
  };
}
```

#### C. Configuration

```javascript
// 🔴 CẦN THÊM: src/config/storage.js
const env = require('./env');

module.exports = {
  provider: env.storageProvider || 's3', // 'local' | 's3' | 'cloudinary'
  
  // S3 config
  s3: {
    region: env.s3Region,
    accessKey: env.s3AccessKey,
    secretKey: env.s3SecretKey,
    bucket: env.s3Bucket,
    cdnDomain: env.s3CdnDomain, // Optional CloudFront domain
  },
  
  // Cloudinary config
  cloudinary: {
    cloudName: env.cloudinaryCloudName,
    apiKey: env.cloudinaryApiKey,
    apiSecret: env.cloudinaryApiSecret,
  },
  
  // Validation rules
  maxFileSizeMB: parseInt(env.maxFileSizeMB || '20', 10),
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  allowedExtensions: ['.pdf', '.docx', '.txt'],
  
  // URL expiry
  signedUrlExpirySeconds: parseInt(env.storageSignedUrlExpiry || '3600', 10),
};
```

```javascript
// 🔴 CẦN THÊM: Trong env.js
storageProvider: process.env.STORAGE_PROVIDER || 's3',
s3Region: process.env.S3_REGION || 'us-east-1',
s3AccessKey: process.env.S3_ACCESS_KEY || '',
s3SecretKey: process.env.S3_SECRET_KEY || '',
s3Bucket: process.env.S3_BUCKET || '',
s3CdnDomain: process.env.S3_CDN_DOMAIN || '',
cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
maxFileSizeMB: process.env.MAX_FILE_SIZE_MB || '20',
storageSignedUrlExpiry: process.env.STORAGE_SIGNED_URL_EXPIRY || '3600',
```

### 2.3. Testing requirements

```javascript
// 🔴 CẦN THÊM: tests/adapters/storageClient.test.js

describe('StorageClient', () => {
  describe('file validation', () => {
    it('should reject files over 20MB', () => {});
    it('should reject invalid MIME types', () => {});
    it('should reject invalid file extensions', () => {});
    it('should accept valid PDF files', () => {});
    it('should accept valid DOCX files', () => {});
    it('should accept valid TXT files', () => {});
  });

  describe('S3 operations', () => {
    it('should upload file to S3', async () => {});
    it('should generate signed URL', async () => {});
    it('should delete file from S3', async () => {});
    it('should get file metadata', async () => {});
    it('should handle S3 errors gracefully', async () => {});
  });

  describe('local storage (dev mode)', () => {
    it('should upload to local filesystem', async () => {});
    it('should generate local file URL', async () => {});
  });
});
```

### 2.4. Checklist

- [ ] Install AWS SDK: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- [ ] Implement S3 upload với metadata
- [ ] Implement signed URL generation
- [ ] Implement file deletion
- [ ] Implement metadata retrieval
- [ ] Add comprehensive file validation (MIME, extension, size)
- [ ] Add error handling cho S3 operations
- [ ] Add logging cho upload/delete operations
- [ ] Support CloudFront CDN (nếu có)
- [ ] Alternative: Cloudinary integration (tuỳ chọn)
- [ ] Remove `STORAGE_MODE` stub, default to 's3'
- [ ] Unit tests coverage ≥ 85%
- [ ] Integration tests với S3 (test bucket)
- [ ] Documentation: Setup S3 bucket, IAM permissions, CORS config

---

## 3. Email Adapter (SendGrid/SES)

### 3.1. Tình trạng hiện tại
- ✅ Có cấu trúc cơ bản với SendGrid/SES
- ✅ Có `buildHtml()` helper cho template fallback
- ⚠️ Chưa có retry logic
- ⚠️ Chưa có email queue (gửi đồng bộ)
- ⚠️ Chưa có template management
- ⚠️ Chưa có email tracking/logging

### 3.2. Cần triển khai

#### A. Retry logic & error handling

```javascript
// src/adapters/emailClient.js

class EmailClient {
  constructor(config) {
    this.config = config || {};
    this.provider = (this.config.provider || 'sendgrid').toLowerCase();
    this.maxRetries = config.maxRetries || 3;
    
    // Initialize providers...
  }

  async send(to, subject, templateId, variables) {
    const from = this.config.fromAddress || 'no-reply@learinal.app';
    
    let lastErr;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        logger.info({
          to: Array.isArray(to) ? to.join(',') : to,
          subject,
          templateId,
          attempt,
        }, 'Sending email');

        const result = await this.sendWithProvider(to, from, subject, templateId, variables);
        
        logger.info({
          to,
          subject,
          messageId: result.messageId,
        }, 'Email sent successfully');
        
        return result;
      } catch (error) {
        lastErr = error;
        logger.error({
          to,
          subject,
          attempt,
          error: error.message,
        }, 'Email send failed');
        
        // Retry on transient errors
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          const backoffMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          await sleep(backoffMs);
        } else {
          break;
        }
      }
    }
    
    // All retries exhausted
    throw new Error(`Failed to send email after ${this.maxRetries} retries: ${lastErr.message}`);
  }

  async sendWithProvider(to, from, subject, templateId, variables) {
    if (this.provider === 'sendgrid') {
      return this.sendWithSendGrid(to, from, subject, templateId, variables);
    }
    
    if (this.provider === 'ses') {
      return this.sendWithSES(to, from, subject, templateId, variables);
    }
    
    throw new Error(`Unsupported email provider: ${this.provider}`);
  }

  async sendWithSendGrid(to, from, subject, templateId, variables) {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(this.config.sendgridApiKey);
    
    const msg = {
      to,
      from,
      subject,
    };
    
    if (templateId) {
      msg.templateId = templateId;
      msg.dynamicTemplateData = variables || {};
    } else {
      msg.html = this.buildHtml(templateId, variables);
    }
    
    const [response] = await sgMail.send(msg);
    return {
      messageId: response.headers['x-message-id'],
      statusCode: response.statusCode,
    };
  }

  async sendWithSES(to, from, subject, templateId, variables) {
    // Existing SES implementation...
    // Add messageId extraction from response
  }

  isRetryableError(error) {
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // SendGrid rate limit
    if (error?.response?.status === 429) {
      return true;
    }
    
    // Server errors
    if (error?.response?.status >= 500) {
      return true;
    }
    
    return false;
  }
}
```

#### B. Email templates

```javascript
// 🔴 CẦN THÊM: src/adapters/emailTemplates.js

const templates = {
  // Welcome email
  welcome: {
    subject: 'Welcome to Learinal!',
    html: (vars) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Welcome to Learinal, ${vars.fullName}!</h1>
        <p>Thank you for joining our learning platform.</p>
        <p>Get started by uploading your first document and generating study materials.</p>
        <a href="${vars.appUrl}/dashboard" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
          Go to Dashboard
        </a>
      </div>
    `,
  },
  
  // Email verification
  emailVerification: {
    subject: 'Verify your email address',
    html: (vars) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Hi ${vars.fullName},</h1>
        <p>Please verify your email address to activate your Learinal account.</p>
        <a href="${vars.verificationLink}" style="display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">
          Verify Email
        </a>
        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
      </div>
    `,
  },
  
  // Password reset
  passwordReset: {
    subject: 'Reset your password',
    html: (vars) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Password Reset Request</h1>
        <p>Hi ${vars.fullName},</p>
        <p>We received a request to reset your password. Click the button below to set a new password.</p>
        <a href="${vars.resetLink}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  },
  
  // Validation request assigned (to Expert)
  validationAssigned: {
    subject: 'New validation request assigned',
    html: (vars) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>New Validation Request</h1>
        <p>Hi ${vars.expertName},</p>
        <p>A new question set has been assigned to you for review.</p>
        <ul>
          <li><strong>Set Title:</strong> ${vars.setTitle}</li>
          <li><strong>Subject:</strong> ${vars.subjectName}</li>
          <li><strong>Number of Questions:</strong> ${vars.numQuestions}</li>
        </ul>
        <a href="${vars.reviewLink}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
          Start Review
        </a>
      </div>
    `,
  },
  
  // Validation completed (to Learner)
  validationCompleted: {
    subject: 'Your question set has been reviewed',
    html: (vars) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Review Completed</h1>
        <p>Hi ${vars.learnerName},</p>
        <p>Your question set "${vars.setTitle}" has been reviewed and is now ${vars.status}.</p>
        ${vars.feedback ? `<p><strong>Feedback:</strong> ${vars.feedback}</p>` : ''}
        <a href="${vars.setLink}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
          View Question Set
        </a>
      </div>
    `,
  },
  
  // Document processing completed
  documentProcessed: {
    subject: 'Your document is ready',
    html: (vars) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Document Processed</h1>
        <p>Hi ${vars.userName},</p>
        <p>Your document "${vars.documentName}" has been successfully processed.</p>
        <ul>
          <li>Summary generated ✓</li>
          <li>Table of contents created ✓</li>
          <li>Ready for question generation ✓</li>
        </ul>
        <a href="${vars.documentLink}" style="display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">
          View Document
        </a>
      </div>
    `,
  },
  
  // Subscription activated
  subscriptionActivated: {
    subject: 'Your subscription is active',
    html: (vars) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Subscription Activated</h1>
        <p>Hi ${vars.fullName},</p>
        <p>Thank you! Your ${vars.planName} subscription is now active.</p>
        <ul>
          <li><strong>Renewal Date:</strong> ${vars.renewalDate}</li>
          <li><strong>Price:</strong> ${vars.price}</li>
        </ul>
        <p>You now have access to premium features:</p>
        <ul>
          ${vars.entitlements.map(e => `<li>${e}</li>`).join('')}
        </ul>
        <a href="${vars.appUrl}/dashboard" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
          Go to Dashboard
        </a>
      </div>
    `,
  },
};

class EmailTemplates {
  static get(templateId) {
    return templates[templateId] || null;
  }
  
  static render(templateId, variables) {
    const template = this.get(templateId);
    if (!template) {
      throw new Error(`Email template not found: ${templateId}`);
    }
    
    return {
      subject: template.subject,
      html: template.html(variables),
    };
  }
}

module.exports = EmailTemplates;
```

```javascript
// Update EmailClient to use templates
const EmailTemplates = require('./emailTemplates');

class EmailClient {
  buildHtml(templateId, variables) {
    if (templateId) {
      try {
        const rendered = EmailTemplates.render(templateId, variables || {});
        return rendered.html;
      } catch (e) {
        logger.warn({ templateId, error: e.message }, 'Template render failed, using fallback');
      }
    }
    
    // Fallback...
    const { fullName, link, message } = variables || {};
    // ...existing fallback code
  }
  
  async send(to, subject, templateId, variables) {
    // If using template, get subject from template
    if (templateId && !subject) {
      try {
        const rendered = EmailTemplates.render(templateId, variables || {});
        subject = rendered.subject;
      } catch (e) {
        subject = 'Notification from Learinal';
      }
    }
    
    // ... rest of send method
  }
}
```

#### C. Email queue (async sending)

```javascript
// 🔴 CẦN THÊM: src/jobs/notifications.email.js (improve existing)

const { enqueueEmail } = require('../adapters/queue');
const EmailClient = require('../adapters/emailClient');
const logger = require('../utils/logger');

async function sendEmailJob(job) {
  const { to, subject, templateId, variables } = job.data;
  
  logger.info({ jobId: job.id, to, templateId }, 'Processing email job');
  
  try {
    const emailClient = new EmailClient(/* config */);
    await emailClient.send(to, subject, templateId, variables);
    
    logger.info({ jobId: job.id, to }, 'Email sent successfully');
  } catch (error) {
    logger.error({ jobId: job.id, to, error: error.message }, 'Email job failed');
    throw error; // BullMQ will retry based on job config
  }
}

module.exports = { sendEmailJob };
```

```javascript
// 🔴 CẦN THÊM: trong queue.js
async function enqueueEmail(payload) {
  ensureQueues();
  if (!queues.email) queues.email = createQueue('email');
  if (!queues.email) throw new Error('Email queue not available');
  
  await queues.email.add('send', payload, { 
    attempts: 5, // More retries for emails
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: 100, // Keep last 100 failed jobs for debugging
  });
}

module.exports = {
  // ... existing exports
  enqueueEmail,
};
```

### 3.3. Testing requirements

```javascript
// 🔴 CẦN THÊM: tests/adapters/emailClient.test.js

describe('EmailClient', () => {
  describe('template rendering', () => {
    it('should render welcome email template', () => {});
    it('should render email verification template', () => {});
    it('should handle missing template gracefully', () => {});
  });

  describe('sending emails', () => {
    it('should send email via SendGrid', async () => {});
    it('should send email via SES', async () => {});
    it('should retry on transient errors', async () => {});
    it('should not retry on auth errors', async () => {});
    it('should log email metadata', async () => {});
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {});
    it('should handle invalid email addresses', async () => {});
  });
});
```

### 3.4. Checklist

- [ ] Add retry logic với exponential backoff
- [ ] Create email templates cho tất cả notification types
- [ ] Integrate templates vào EmailClient
- [ ] Setup email queue (BullMQ)
- [ ] Add email tracking/logging
- [ ] Add test mode (console log instead of send)
- [ ] Handle bounces & unsubscribes (nếu cần)
- [ ] Unit tests coverage ≥ 85%
- [ ] Integration tests với SendGrid/SES (test mode)
- [ ] Documentation: Email templates, setup SendGrid/SES

---

## 4. Queue System (Redis + BullMQ)

[Tiếp tục trong phần tiếp theo do giới hạn độ dài...]

### 4.1. Tình trạng hiện tại
- ✅ Có cấu trúc cơ bản với BullMQ
- ✅ Có 3 queues: documentsIngestion, contentSummary, questionsGenerate
- ⚠️ Chưa có worker implementation hoàn chỉnh
- ⚠️ Chưa có DLQ (Dead Letter Queue)
- ⚠️ Chưa có monitoring/metrics
- ⚠️ Chưa có error handling đầy đủ trong workers

### 4.2. Cần triển khai

Xem chi tiết trong file PHASE_1_ADAPTERS.md phần Queue System...

---

## Timeline Week by Week

### Week 1: LLM + Storage
**Days 1-2:** LLM Adapter improvements
- Error handling, retry logic, cost tracking
- New methods: generateToC, generateSummary

**Days 3-4:** Storage Adapter (S3)
- S3 integration với signed URLs
- File validation comprehensive

**Day 5:** Testing & documentation
- Unit tests cho LLM & Storage
- API documentation

### Week 2: Email + Queue + Payment
**Days 1-2:** Email Adapter
- Email templates
- Retry logic & queue integration

**Days 3-4:** Queue System
- Worker improvements
- DLQ, monitoring

**Day 5:** Payment Adapter (Stripe)
- Webhook handling
- Subscription management integration

---

**Tiếp tục với PHASE_2_BUSINESS_FLOWS.md...**
