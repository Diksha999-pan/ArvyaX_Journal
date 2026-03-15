# ARCHITECTURE.md — ArvyaX Journal Syste,

## 1. How would you scale this to 100k users?

The current SQLite + single-server setup works well for development and small loads. For 100k users, the following changes are needed:

### Database
- Replace SQLite with **PostgreSQL** (or PlanetScale for serverless)
- Add indexes on `userId` and `createdAt` for fast queries
- Use **read replicas** to offload `GET` requests from the primary DB
- Partition the `journal_entries` table by `userId` hash for horizontal scaling

### Backend
- Move from a single Node.js process to **horizontally scaled instances** behind a load balancer (e.g., NGINX or AWS ALB)
- Use **PM2 cluster mode** or container orchestration (Kubernetes) to run multiple worker processes
- Store sessions/user state in **Redis** (not in-process memory)

### LLM Requests
- LLM calls are the slowest part — run them as **async background jobs** using a queue (BullMQ + Redis)
- User gets immediate "Analysis queued" response; result is pushed via WebSocket or polled
- This way, API response time stays under 100ms even during LLM processing

### Infrastructure
```
Client → CDN (static frontend)
       → Load Balancer
          → Node.js instances (x N)
             → PostgreSQL (primary + replicas)
             → Redis (queue + cache)
             → LLM Worker Pool (separate service)
```

---

## 2. How would you reduce LLM cost?

LLM API calls are charged per token. Strategies to reduce cost:

### a) Caching (most impactful)
- Hash the journal entry text → check Redis for existing analysis
- If cache hit → return instantly, no API call
- Similar entries (e.g., "felt calm in the forest") will frequently match → high cache hit rate

### b) Batch Processing
- Instead of analyzing each entry in real-time, accumulate entries and process in batches during off-peak hours
- Reduces API calls by grouping multiple texts into one prompt

### c) Smaller / Cheaper Models
- Use **Gemini Flash** (free, faster) instead of Gemini Pro for short entries
- Only escalate to a larger model if confidence score is low

### d) Prompt Compression
- Keep the system prompt minimal — each extra word costs tokens
- Current prompt is ~80 tokens; trim to <50 by removing examples

### e) Rate Limiting per User
- Cap LLM analysis at 5 requests/user/day to prevent abuse
- Use Redis to track usage counters with TTL of 24 hours

### f) Rule-Based Pre-filter
- Already implemented: if the text is very short (<10 words) or matches obvious emotion patterns, skip the LLM and use the rule-based fallback
- Estimated 20–30% of entries can be handled without any LLM call

---

## 3. How would you cache repeated analysis?

### Strategy: Hash-Based Result Cache

```
Request → MD5(text.trim().toLowerCase()) → Redis GET
  Hit  → Return cached result (< 1ms)
  Miss → Call LLM → Store in Redis with TTL → Return result
```

### Implementation

```js
const crypto = require('crypto')
const redis = require('ioredis')
const client = new redis()

async function analyzeWithCache(text) {
  const key = 'analysis:' + crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex')
  
  const cached = await client.get(key)
  if (cached) return JSON.parse(cached)
  
  const result = await callGeminiAPI(text)
  await client.setex(key, 60 * 60 * 24 * 7, JSON.stringify(result)) // 7-day TTL
  return result
}
```

### Cache TTL Strategy
- Analysis results are **immutable** (same text → same emotion)
- Use a **7-day TTL** to avoid stale entries from edge cases (e.g., model updates)
- Store in Redis (in-memory, sub-millisecond reads)

### Database-Level Cache
- After LLM analysis, store the result in the `journal_entries` table (`emotion`, `keywords`, `summary`, `analyzed=1`)
- On subsequent fetches, return stored values — no repeat LLM call for the same entry

---

## 4. How would you protect sensitive journal data?

Journal entries are deeply personal mental health data. Protection is critical.

### a) Encryption at Rest
- Encrypt the `text` column using **AES-256** before storing in the database
- Store encryption keys in a secrets manager (AWS Secrets Manager / HashiCorp Vault), never in code or `.env` files

### b) Encryption in Transit
- Enforce **HTTPS / TLS 1.3** for all API communication
- Reject any HTTP connections in production

### c) Authentication & Authorization
- Implement **JWT-based auth** — every API request must include a valid token
- Backend verifies `token.userId === params.userId` before returning any data
- Users can ONLY access their own entries — no cross-user data access

### d) LLM Data Privacy
- **Never send userId or personal identifiers to the LLM** — only the anonymized journal text
- Consider running an open-source LLM (Ollama + Llama 3) **on-premise** so journal text never leaves your servers

### e) Rate Limiting & Abuse Prevention
- Rate limit all endpoints (express-rate-limit): 100 req/15min per IP
- Prevent brute-force userId enumeration on `GET /api/journal/:userId`

### f) Data Minimization & Deletion
- Provide a `DELETE /api/journal/:userId` endpoint to allow full data deletion
- Comply with DPDP Act (India) / GDPR principles: collect only what's needed, retain only as long as needed

### g) Input Sanitization
- Sanitize all inputs to prevent SQL injection (parameterized queries already used via better-sqlite3)
- Validate text length to prevent oversized payloads

### Summary Table

| Threat                  | Mitigation                          |
|------------------------|-------------------------------------|
| Data breach             | AES-256 encryption at rest          |
| Man-in-the-middle       | HTTPS / TLS 1.3                     |
| Unauthorized access     | JWT auth + userId ownership checks  |
| LLM data leak           | Strip PII before LLM, use on-prem   |
| Brute force             | Rate limiting + IP blocking         |
| SQL injection           | Parameterized queries               |
| Regulatory non-compliance | DPDP / GDPR delete endpoint       |
