# HuggingFace Router Implementation Spec

## Plan Structure (Updated)

### Trial Plan (2-day free trial)
- **Requires**: Credit card to start (prevents abuse)
- **Context cap**: 8,000 tokens
- **Max output**: 256 tokens
- **Requests/day**: 30
- **Monthly output cap**: 50,000 tokens (safe for trial)

### Paid Plan ($3/month)
- **Price**: $3/month (not $2/$5/$10 - simplified)
- **Context cap**: 16,000 tokens
- **Max output**: 512 tokens
- **Requests/day**: 100
- **Monthly output cap**: 300,000 tokens (hard limit)

## Database Schema

### playground_subscriptions
```sql
CREATE TABLE playground_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  plan_tier VARCHAR(20) NOT NULL CHECK (plan_tier IN ('trial', 'paid')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due')),
  trial_started_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_playground_sub_user ON playground_subscriptions(user_id);
CREATE INDEX idx_playground_sub_stripe ON playground_subscriptions(stripe_subscription_id);
```

### hf_usage_logs
```sql
CREATE TABLE hf_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES playground_subscriptions(id),
  model VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'nscale', -- nscale, together, fal-ai, etc.
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 8),
  latency_ms INTEGER,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'rate_limited', 'quota_exceeded')),
  error_message TEXT,
  request_hash VARCHAR(64), -- For idempotency
  request_payload JSONB, -- Store the request for debugging
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_hf_usage_user_created ON hf_usage_logs(user_id, created_at);
CREATE INDEX idx_hf_usage_model ON hf_usage_logs(model);
CREATE INDEX idx_hf_usage_status ON hf_usage_logs(status);
CREATE INDEX idx_hf_usage_date ON hf_usage_logs(DATE(created_at));
```

### hf_daily_usage (for fast quota checks)
```sql
CREATE TABLE hf_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  requests_count INTEGER NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
  UNIQUE(user_id, usage_date)
);

CREATE INDEX idx_hf_daily_usage_user_date ON hf_daily_usage(user_id, usage_date);
```

### hf_monthly_usage (for monthly caps)
```sql
CREATE TABLE hf_monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_year INTEGER NOT NULL,
  usage_month INTEGER NOT NULL,
  requests_count INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
  UNIQUE(user_id, usage_year, usage_month)
);

CREATE INDEX idx_hf_monthly_usage_user ON hf_monthly_usage(user_id, usage_year, usage_month);
```

## API Endpoints

### POST /api/v1/hf/chat/completions
OpenAI-compatible chat completions endpoint.

**Headers:**
- `Authorization: Bearer {xpersona_api_key}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "model": "Qwen/Qwen2.5-Coder-7B-Instruct",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false,
  "max_tokens": 256
}
```

**Rate Limit Enforcement:**
1. Parse request, validate max_tokens against plan limit
2. Check daily request count (30 for trial, 100 for paid)
3. Check monthly output token cap
4. Check context length (count tokens in messages)
5. If all pass, forward to HF
6. Log usage asynchronously

**Error Responses:**
- `429`: Rate limit exceeded (daily or monthly)
- `400`: Invalid request (max_tokens too high, context too long)
- `402`: Payment required (trial expired, no subscription)
- `403`: Quota exceeded (monthly cap reached)

### GET /api/v1/hf/usage
Get current usage for authenticated user.

**Response:**
```json
{
  "plan": "paid",
  "trialEndsAt": null,
  "today": {
    "requestsUsed": 45,
    "requestsLimit": 100,
    "tokensOutput": 12050
  },
  "thisMonth": {
    "tokensOutput": 145000,
    "tokensLimit": 300000,
    "estimatedCost": 0.45
  }
}
```

### GET /api/v1/hf/models
List available models (filtered by plan tier).

## Rate Limiting Logic

```typescript
// lib/hf-router/rate-limit.ts

interface PlanLimits {
  contextCap: number;      // 8192 for trial, 16384 for paid
  maxOutputTokens: number; // 256 for trial, 512 for paid
  maxRequestsPerDay: number; // 30 for trial, 100 for paid
  maxOutputTokensPerMonth: number; // 50000 for trial, 300000 for paid
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  trial: {
    contextCap: 8192,
    maxOutputTokens: 256,
    maxRequestsPerDay: 30,
    maxOutputTokensPerMonth: 50000,
  },
  paid: {
    contextCap: 16384,
    maxOutputTokens: 512,
    maxRequestsPerDay: 100,
    maxOutputTokensPerMonth: 300000,
  },
};

async function checkRateLimits(
  userId: string,
  plan: 'trial' | 'paid',
  requestedMaxTokens: number,
  messageTokens: number
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = PLAN_LIMITS[plan];
  
  // Check max_tokens against plan limit
  if (requestedMaxTokens > limits.maxOutputTokens) {
    return { 
      allowed: false, 
      reason: `max_tokens ${requestedMaxTokens} exceeds plan limit of ${limits.maxOutputTokens}` 
    };
  }
  
  // Check context length
  if (messageTokens > limits.contextCap) {
    return { 
      allowed: false, 
      reason: `Context length ${messageTokens} exceeds plan limit of ${limits.contextCap}` 
    };
  }
  
  // Check daily request count
  const dailyRequests = await getDailyRequestCount(userId);
  if (dailyRequests >= limits.maxRequestsPerDay) {
    return { 
      allowed: false, 
      reason: `Daily request limit of ${limits.maxRequestsPerDay} reached` 
    };
  }
  
  // Check monthly output token cap
  const monthlyTokens = await getMonthlyOutputTokens(userId);
  if (monthlyTokens + requestedMaxTokens > limits.maxOutputTokensPerMonth) {
    return { 
      allowed: false, 
      reason: `Monthly output token limit would be exceeded` 
    };
  }
  
  return { allowed: true };
}
```

## Stripe Integration

### Webhook Events to Handle
1. `customer.subscription.created` - User starts trial
2. `customer.subscription.updated` - Plan changes
3. `customer.subscription.deleted` - Cancellation
4. `invoice.payment_failed` - Mark as past_due

### Trial Flow
1. User clicks "Start Trial" on Playground page
2. Create Stripe Checkout Session with:
   - Trial period: 2 days
   - Require payment method
   - Price: $3/month after trial
3. On successful checkout, create `playground_subscriptions` record
4. User can immediately use the HF router

## Cost Estimation

Based on HF Inference pricing (~$0.0001-0.001 per 1K tokens):

**Trial Users (max 50K tokens/month):**
- Cost: ~$0.005-0.05 per user/month
- 1000 trial users: ~$5-50/month

**Paid Users (max 300K tokens/month):**
- Cost: ~$0.03-0.30 per user/month
- Revenue: $3/user/month
- Margin: 90-99%

This is very safe pricing!

## Implementation Order

1. **Database migrations** - Create tables
2. **Core router** - Basic proxy to HF
3. **Rate limiting** - Check limits before forwarding
4. **Usage tracking** - Log all requests
5. **Stripe integration** - Handle trials and billing
6. **Frontend updates** - Playground UI
7. **Monitoring** - Admin dashboard

## Environment Variables Needed

```bash
# HuggingFace
HF_ROUTER_TOKEN=hf_xxx  # Your master HF token

# Stripe (already have, but need new price IDs)
STRIPE_PLAYGROUND_PRICE_ID=price_xxx

# Rate Limiting (optional tuning)
HF_RATE_LIMIT_CACHE_TTL=60
```
