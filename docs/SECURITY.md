# 🔒 Security Documentation - CogniLeapAI MVP

This document outlines the security measures, best practices, and compliance considerations for CogniLeapAI MVP.

## 🛡️ Security Architecture Overview

### Multi-Layer Security Model

1. **Application Layer** - Input validation, secure API design
2. **Authentication Layer** - Supabase Auth with OAuth support
3. **Database Layer** - Row Level Security (RLS) policies
4. **Storage Layer** - Private buckets with signed URLs
5. **Infrastructure Layer** - Vercel edge network, HTTPS enforcement

## 🔐 Authentication & Authorization

### Supabase Authentication

CogniLeapAI uses Supabase Auth for secure user management:

- **Email/Password Authentication**
  - Passwords hashed with bcrypt
  - Minimum 8 characters required
  - Email confirmation optional
  - Secure password reset via email

- **Google OAuth 2.0**
  - PKCE flow for enhanced security
  - Server-side token exchange
  - Automatic profile creation
  - Secure state parameter validation

### Session Management

- **HTTP-only cookies** - Prevents XSS attacks
- **Automatic token refresh** - Seamless user experience
- **Server-side validation** - All requests verified
- **Secure session storage** - Encrypted at rest

### Route Protection

```typescript
// Middleware-based authentication
middleware.ts - Protects all routes under:
  - /dashboard/*
  - /chat/*
  - /api/* (except public endpoints)

// Excluded routes (public access):
  - /auth/* (sign-in, sign-up, etc.)
  - /_next/* (Next.js internals)
  - /api/health (health checks)
```

## 🗄️ Database Security

### Row Level Security (RLS)

**26+ RLS Policies** ensure complete data isolation between users:

#### Documents Table
```sql
-- Users can only view their own documents
CREATE POLICY "Users can view own documents"
ON public.documents FOR SELECT
USING (auth.uid() = user_id);

-- Users can only insert documents with their user_id
CREATE POLICY "Users can insert own documents"
ON public.documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Similar policies for UPDATE and DELETE
```

#### Cascade Security
- **Sections**: Inherit access from parent document
- **Outputs**: Inherit access from parent document
- **Messages**: Inherit access from parent conversation
- **Conversations**: Direct user ownership

### Service Role Usage

The service role key bypasses RLS and is **ONLY used for**:
- Initial document processing
- Background tasks
- Admin operations

**NEVER exposed to client-side code!**

### SQL Injection Protection

- All queries use parameterized statements
- Supabase client sanitizes inputs automatically
- No raw SQL execution from user input

## 📦 Storage Security

### Private Document Storage

All PDFs are stored in a **private Supabase Storage bucket**:

```typescript
// Storage configuration
Bucket: "documents"
Public: false
Allowed MIME types: application/pdf

// Access control
- Files only accessible via signed URLs
- URLs expire after 60 seconds
- User must own the document to access
```

### File Upload Validation

```typescript
// Client-side validation
- Max file size: 10MB (configurable)
- MIME type: application/pdf only
- File extension: .pdf only

// Server-side validation
- PDF signature verification
- Content scanning for malicious files
- Checksum validation for duplicates
```

## 🔑 API Key Management

### Environment Variables

All sensitive keys are stored as environment variables:

```env
# Server-side only (NEVER exposed to client)
SUPABASE_SERVICE_ROLE_KEY=xxx
GOOGLE_GENERATIVE_AI_API_KEY=xxx

# Safe to expose (public keys)
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### Key Rotation

**Recommended rotation schedule**:
- Gemini API Key: Every 90 days
- Supabase Service Role Key: Every 180 days
- OAuth Client Secret: Every 180 days

**How to rotate**:
1. Generate new key in respective service
2. Update Vercel environment variables
3. Redeploy application
4. Revoke old key after verification

## 🌐 Network Security

### HTTPS Enforcement

- All production traffic over HTTPS
- HSTS headers enabled
- TLS 1.2+ required
- Certificate auto-renewal via Vercel

### CORS Configuration

```typescript
// Supabase CORS settings
Allowed origins:
  - https://your-domain.com
  - http://localhost:3000 (development only)

Allowed methods:
  - GET, POST, PUT, DELETE

Credentials: true (for authentication)
```

### Content Security Policy (CSP)

```typescript
// Next.js security headers
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## 🛡️ Input Validation & Sanitization

### Client-Side Validation

```typescript
// React Hook Form with Zod validation
- Email format validation
- Password strength requirements
- File type and size validation
- Input length limits
```

### Server-Side Validation

```typescript
// API route validation
- Request body schema validation
- Parameter type checking
- File upload validation
- Rate limiting (via Vercel)
```

### XSS Prevention

- All user input sanitized before storage
- Markdown rendering with DOMPurify
- React automatic XSS protection
- No `dangerouslySetInnerHTML` usage

### SQL Injection Prevention

- Parameterized queries only
- Supabase client automatic sanitization
- No raw SQL from user input
- Input validation before database operations

## 🚨 Threat Mitigation

### OWASP Top 10 Coverage

| Threat | Mitigation |
|--------|-----------|
| **A01: Broken Access Control** | RLS policies, middleware authentication |
| **A02: Cryptographic Failures** | HTTPS, bcrypt hashing, secure cookies |
| **A03: Injection** | Parameterized queries, input validation |
| **A04: Insecure Design** | Security-first architecture, principle of least privilege |
| **A05: Security Misconfiguration** | Secure defaults, regular audits |
| **A06: Vulnerable Components** | Automated dependency updates, regular scans |
| **A07: Authentication Failures** | Supabase Auth, secure session management |
| **A08: Software & Data Integrity** | Checksum verification, signed URLs |
| **A09: Security Logging** | Supabase logs, Vercel function logs |
| **A10: SSRF** | Input validation, restricted network access |

### Rate Limiting

Vercel automatically provides:
- 10 requests/second per IP
- 100 requests/minute per IP
- DDoS protection

Additional app-level rate limiting:
- 5 AI requests/minute per user
- 10 document uploads/hour per user

### DDoS Protection

- Vercel edge network
- Automatic traffic filtering
- Geographic distribution
- CDN caching for static assets

## 🔍 Security Monitoring

### Logging & Auditing

**Supabase Logs**:
- Database queries
- Authentication events
- RLS policy violations
- Storage access attempts

**Vercel Logs**:
- Function execution
- Build errors
- Runtime errors
- Performance metrics

**Application Logs**:
- User actions (document uploads, generations)
- API errors
- Authentication failures
- Rate limit violations

### Security Advisors

Supabase provides automated security advisors:

```sql
-- Check for security issues
SELECT * FROM supabase_advisors
WHERE type = 'security'
AND status = 'active';
```

Common checks:
- RLS policies enabled
- Storage bucket privacy
- Unused indexes
- Exposed API keys (in logs)

## 📋 Compliance Considerations

### GDPR Compliance

**Data Rights**:
- Right to access: Users can export their data
- Right to deletion: Account deletion removes all user data
- Right to portability: Export functionality for all data
- Right to rectification: Users can update their information

**Data Processing**:
- Minimal data collection
- Purpose-limited processing
- Data retention policies
- Transparent privacy policy

**Consent Management**:
- Clear opt-in for email communications
- Cookie consent (if analytics added)
- Terms of service acceptance

### Data Retention

**Automatic Deletion**:
- Deleted documents: Immediate removal + cascade delete
- User account deletion: All associated data removed
- Session data: 30 days inactivity

**Backup Retention**:
- Supabase automated backups: 7 days
- Point-in-time recovery: Available
- Backup encryption: At rest and in transit

### SOC 2 Considerations

CogniLeapAI follows SOC 2 principles:

**Security**:
- Access controls (RLS)
- Network security (HTTPS)
- Change management (Git)

**Availability**:
- 99.9% uptime (Vercel SLA)
- Redundancy (Supabase multi-region)
- Monitoring & alerts

**Processing Integrity**:
- Input validation
- Data consistency checks
- Transaction atomicity

**Confidentiality**:
- Encryption at rest & in transit
- Private storage
- Secure key management

**Privacy**:
- Data minimization
- User consent
- Right to deletion

## 🔐 Secrets Management

### What Should Never Be Public

❌ **NEVER commit these to GitHub**:
- `.env.local` file
- API keys (Gemini, Supabase service role)
- OAuth client secrets
- Database passwords
- Private project references
- Access tokens

✅ **Safe to commit**:
- `.env.example` (with placeholders)
- Public Supabase anon key
- Public Supabase URL
- Client-side configuration
- Next.js configuration

### Vercel Environment Variables

**Environment Scopes**:
- Production: Live users
- Preview: Pull request deployments
- Development: Local development

**Best Practices**:
1. Set all secrets for all environments
2. Use different keys for dev/prod
3. Rotate keys regularly
4. Never log environment variables
5. Use Vercel's built-in encryption

## 🛠️ Security Testing

### Pre-Deployment Checklist

- [ ] All environment variables set in Vercel
- [ ] `.env.local` NOT committed to Git
- [ ] RLS policies tested and working
- [ ] Storage bucket is private
- [ ] OAuth redirect URIs configured
- [ ] HTTPS enforced in production
- [ ] Security headers configured
- [ ] Input validation on all forms
- [ ] API routes protected with authentication
- [ ] Error messages don't expose sensitive info

### Testing Procedures

**Authentication Testing**:
```bash
# Test sign-up flow
# Test sign-in flow
# Test OAuth flow
# Test password reset
# Test session expiry
# Test route protection
```

**Authorization Testing**:
```bash
# Try accessing other users' documents
# Try modifying other users' data
# Try accessing admin endpoints
# Test RLS policy violations
```

**Input Validation Testing**:
```bash
# Test SQL injection attempts
# Test XSS attempts
# Test file upload validation
# Test API parameter validation
```

## 📞 Security Incident Response

### Incident Procedure

1. **Detection**: Monitor logs for unusual activity
2. **Assessment**: Determine scope and impact
3. **Containment**: Isolate affected systems
4. **Eradication**: Remove threat and patch vulnerabilities
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Document and improve

### Contact Information

**Security Issues**:
- Create a private GitHub issue
- Email: security@yourdomain.com (set this up!)
- Response time: Within 24 hours

**Vulnerability Disclosure**:
- Responsible disclosure encouraged
- 90-day disclosure timeline
- Recognition for valid reports

## 📚 Security Resources

### Documentation
- [Supabase Security Best Practices](https://supabase.com/docs/guides/security)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [Vercel Security](https://vercel.com/docs/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

### Tools
- [Supabase Security Advisor](https://supabase.com/dashboard)
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Snyk](https://snyk.io/) for dependency scanning
- [GitHub Dependabot](https://github.com/dependabot) for automated updates

## 🔄 Regular Security Maintenance

### Weekly
- [ ] Review Vercel function logs
- [ ] Check Supabase security advisors
- [ ] Monitor error rates

### Monthly
- [ ] Update dependencies (`pnpm update`)
- [ ] Run security audit (`npm audit`)
- [ ] Review access logs
- [ ] Test backup recovery

### Quarterly
- [ ] Rotate API keys
- [ ] Security penetration testing
- [ ] Review and update security policies
- [ ] User security training

### Annually
- [ ] Comprehensive security audit
- [ ] Update compliance documentation
- [ ] Review disaster recovery plan
- [ ] Update security procedures

---

**Security is an ongoing process, not a one-time setup. Stay vigilant and keep security practices up to date!**

For security concerns or questions, please create a private GitHub issue or contact the security team.
