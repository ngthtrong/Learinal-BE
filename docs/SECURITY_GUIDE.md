# Security Hardening Guide - Learinal Backend

## Overview

This document describes the security measures implemented in the Learinal backend to protect against common web vulnerabilities.

## Security Headers (Helmet.js)

### Implemented Headers

1. **Content-Security-Policy (CSP)**
   - Prevents XSS attacks by controlling resource loading
   - Default: `default-src 'self'`
   - Development: Allows inline scripts/styles for testing
   - Production: Strict policy, no inline code

2. **HTTP Strict Transport Security (HSTS)**
   - Forces HTTPS connections
   - Max age: 1 year (31,536,000 seconds)
   - Includes subdomains
   - Preload enabled

3. **X-Frame-Options**
   - Set to `DENY`
   - Prevents clickjacking attacks

4. **X-Content-Type-Options**
   - Set to `nosniff`
   - Prevents MIME type sniffing

5. **Referrer-Policy**
   - Set to `strict-origin-when-cross-origin`
   - Protects user privacy

6. **X-XSS-Protection**
   - Enabled for older browsers
   - Modern browsers use CSP instead

### Configuration

See `src/config/helmet.js` for full configuration.

## CORS (Cross-Origin Resource Sharing)

### Strict Origin Validation

- **Production**: Only whitelisted origins allowed
- **Development**: Flexible for local testing
- **Configuration**: `CORS_ALLOWED_ORIGINS` environment variable

### Example Configuration

```env
# Production
CORS_ALLOWED_ORIGINS=https://learinal.com,https://app.learinal.com

# Development (optional - allows all if not set)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Features

- Credentials support (cookies, auth headers)
- Preflight caching (24 hours)
- Exposed headers for client access
- Strict methods whitelist

## Input Sanitization

### NoSQL Injection Prevention

Implemented in `src/middleware/sanitizeInputs.js`:

1. **MongoDB Operator Filtering**
   - Removes keys starting with `$` (`$gt`, `$ne`, `$regex`, etc.)
   - Blocks dot notation in keys (`user.email`)
   - Prevents prototype pollution (`__proto__`, `constructor`)

2. **Null Byte Removal**
   - Strips `\0` characters from strings

3. **Recursive Sanitization**
   - Applied to `req.body`, `req.query`, `req.params`
   - Handles nested objects and arrays

### Example

```javascript
// Malicious input
{ "$gt": "", "email": "admin@example.com" }

// After sanitization
{ "email": "admin@example.com" }
```

## Rate Limiting

### Tiered Rate Limits

| Endpoint Type | Limit | Window | Key |
|--------------|-------|--------|-----|
| General API | 100 req | 15 min | IP |
| Authentication | 5 req | 15 min | IP |
| File Upload | 10 req | 1 hour | User ID/IP |
| Expensive Ops (LLM) | 20 req | 1 hour | User ID/IP |
| Webhooks | 100 req | 1 min | IP |

### Configuration

See `src/config/rateLimits.js` for detailed settings.

### Rate Limit Headers

Clients receive these headers:

- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining
- `RateLimit-Reset`: Time until reset (Unix timestamp)
- `Retry-After`: Seconds to wait (if exceeded)

### Bypass in Tests

Rate limiting is automatically disabled when `NODE_ENV=test`.

## Authentication Security

### JWT Best Practices

1. **Token Expiration**
   - Access tokens: 1 hour
   - Refresh tokens: 7 days

2. **Secure Storage**
   - Never store in localStorage (XSS vulnerable)
   - Use httpOnly cookies for refresh tokens
   - Authorization header for access tokens

3. **Token Rotation**
   - Refresh tokens rotated on use
   - Old refresh tokens invalidated

### Password Security

1. **Bcrypt Hashing**
   - Work factor: 10 rounds
   - Automatic salt generation

2. **Password Requirements**
   - Minimum 8 characters
   - Maximum 128 characters (prevent DoS)

3. **Reset Token Security**
   - Cryptographically random (32 bytes)
   - Single-use tokens
   - 1-hour expiration

## Database Security

### MongoDB Security

1. **Connection Security**
   - Use connection string with authentication
   - Enable TLS/SSL in production
   - Principle of least privilege

2. **Query Security**
   - Input sanitization (see above)
   - Parameterized queries via Mongoose
   - No dynamic query construction

3. **Index Security**
   - Unique indexes on email
   - Partial indexes for validation requests
   - Prevents duplicate records

### Example Configuration

```env
# Production MongoDB URI with auth
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/learinal?retryWrites=true&w=majority&tls=true
```

## File Upload Security

### Restrictions

1. **File Type Validation**
   - Allowed: `.pdf`, `.docx`, `.txt`
   - Validation: MIME type + extension
   - Reject: Executables, scripts

2. **File Size Limit**
   - Maximum: 20MB
   - Prevents DoS attacks

3. **Temporary Storage**
   - Uploaded to temp directory
   - Deleted after processing
   - Automatic cleanup (hourly cron)

4. **Malware Scanning**
   - TODO: Integrate ClamAV or VirusTotal
   - Scan before processing

## API Security Checklist

### Before Production Deployment

- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ALLOWED_ORIGINS` with production domains
- [ ] Enable HTTPS (reverse proxy: nginx, Cloudflare)
- [ ] Set secure JWT secrets (32+ characters, random)
- [ ] Configure MongoDB authentication
- [ ] Enable MongoDB TLS/SSL
- [ ] Set up firewall rules (allow only necessary ports)
- [ ] Configure rate limiting per environment
- [ ] Enable request logging (but sanitize sensitive data)
- [ ] Set up monitoring and alerting
- [ ] Regular security audits (`npm audit`)
- [ ] Keep dependencies updated
- [ ] Implement CSRF protection for stateful operations
- [ ] Add API key authentication for webhooks

## Environment Variables

### Required for Production

```env
# Server
NODE_ENV=production
PORT=3000

# Security
JWT_SECRET=<32-byte-random-string>
JWT_REFRESH_SECRET=<32-byte-random-string>
CORS_ALLOWED_ORIGINS=https://learinal.com,https://app.learinal.com

# Database
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/learinal?tls=true

# Redis
REDIS_URL=redis://user:pass@redis-host:6379

# OAuth
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_REDIRECT_URI=https://api.learinal.com/oauth/google/callback

# Email
SENDGRID_API_KEY=<sendgrid-api-key>
EMAIL_FROM=noreply@learinal.com

# Storage
STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
AWS_S3_BUCKET=learinal-documents

# LLM
GEMINI_API_KEY=<gemini-api-key>

# Payment
SEPAY_API_KEY=<sepay-api-key>
SEPAY_WEBHOOK_SECRET=<sepay-webhook-secret>
```

## Security Testing

### Tools

1. **OWASP ZAP**
   - Automated security scanning
   - Vulnerability detection

2. **npm audit**
   - Dependency vulnerability scanning
   - Run before each deployment

3. **Snyk**
   - Continuous monitoring
   - GitHub integration

### Testing Checklist

- [ ] Test CORS with different origins
- [ ] Test rate limiting with multiple requests
- [ ] Test input sanitization with malicious payloads
- [ ] Test authentication with expired tokens
- [ ] Test file upload with invalid file types
- [ ] Test SQL/NoSQL injection attempts
- [ ] Test XSS payloads in inputs
- [ ] Test CSRF attacks on state-changing endpoints
- [ ] Verify security headers with online tools (securityheaders.com)

## Incident Response

### If Security Breach Detected

1. **Immediate Actions**
   - Isolate affected systems
   - Revoke compromised credentials
   - Block malicious IPs
   - Enable maintenance mode if needed

2. **Investigation**
   - Review access logs
   - Identify attack vector
   - Assess data impact

3. **Remediation**
   - Patch vulnerabilities
   - Update credentials
   - Notify affected users (if applicable)
   - Document incident

4. **Prevention**
   - Update security measures
   - Conduct security training
   - Review and update policies

## Monitoring

### Security Metrics

- Failed authentication attempts per IP
- Rate limit violations
- Suspicious request patterns
- File upload anomalies
- Database query errors
- Webhook signature failures

### Alerting Thresholds

- 10+ failed logins from same IP: Alert
- Rate limit exceeded 100+ times: Alert
- Unauthorized access attempts: Alert
- Unexpected error spikes: Alert

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [MongoDB Security Checklist](https://www.mongodb.com/docs/manual/administration/security-checklist/)

## Next Steps

- [ ] Implement API key authentication for webhooks
- [ ] Add CSRF protection for cookie-based auth
- [ ] Integrate malware scanning for file uploads
- [ ] Set up Web Application Firewall (WAF)
- [ ] Implement API rate limiting per user tier
- [ ] Add request signature verification
- [ ] Set up intrusion detection system (IDS)
