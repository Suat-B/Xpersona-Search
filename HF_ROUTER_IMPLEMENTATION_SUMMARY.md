# HuggingFace Router Implementation Summary

## Overview

I've implemented a complete HuggingFace inference router system that routes requests from your single HF_TOKEN to multiple user accounts with strict rate limiting and usage tracking.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  User Request   │────▶│  Xpersona Router │────▶│  HuggingFace API │
│  (X-API-Key)    │     │                  │     │  (HF_TOKEN)      │
└─────────────────┘     └──────────────────┘     └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Rate Limiting   │
                        │  - Daily quota   │
                        │  - Monthly cap   │
                        │  - Context size  │
                        └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Usage Tracking  │
                        │  - Logs all reqs │
                        │  - Cost estimates│
                        └──────────────────┘
```

## Files Created

### Database Schema
1. **`lib/db/playground-schema.ts`** - Drizzle schema definitions
   - `playground_subscriptions` - User subscriptions (trial/paid)
   - `hf_usage_logs` - Every request logged
   - `hf_daily_usage` - Daily aggregates for fast quota checks
   - `hf_monthly_usage` - Monthly aggregates for caps

2. **`drizzle/0025_playground_hf_router.sql`** - SQL migration
   - Creates all tables with proper indexes
   - Run with: `npx drizzle-kit migrate`

### Core Library
3. **`lib/hf-router/rate-limit.ts`** - Rate limiting logic
   - `PLAN_LIMITS` - Configuration for trial/paid plans
   - `checkRateLimits()` - Validates all quotas before forwarding
   - `incrementUsage()` - Updates counters after requests
   - `getUserUsageStats()` - Gets current usage for a user
   - Token estimation helpers

### API Routes
4. **`app/api/v1/hf/chat/completions/route.ts`** - Main router endpoint
   - OpenAI-compatible POST endpoint
   - Authenticates via X-API-Key header
   - Enforces rate limits
   - Proxies to HF Inference API
   - Handles streaming & non-streaming responses
   - Logs usage asynchronously

5. **`app/api/v1/hf/usage/route.ts`** - Usage stats endpoint
   - Returns current usage for authenticated user
   - Includes limits, remaining quota, and costs

## Plan Structure

### Trial Plan (2-day free trial, requires card)
| Limit | Value |
|-------|-------|
| Daily requests | 30 |
| Context cap | 8,192 tokens |
| Max output | 256 tokens/request |
| Monthly output | 50,000 tokens |

### Paid Plan ($3/month)
| Limit | Value |
|-------|-------|
| Daily requests | 100 |
| Context cap | 16,384 tokens |
| Max output | 512 tokens/request |
| Monthly output | 300,000 tokens (hard cap) |

## Environment Variables

Add to your `.env`:

```bash
# HuggingFace Router
HF_ROUTER_TOKEN=hf_your_token_here

# Existing Stripe vars (add new price ID)
STRIPE_PLAYGROUND_PRICE_ID=price_xxxxx
```

## API Usage

### 1. Chat Completions

```bash
curl -X POST https://xpersona.co/api/v1/hf/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_xpersona_api_key" \
  -d '{
    "model": "Qwen/Qwen2.5-Coder-7B-Instruct:nscale",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 256
  }'
```

### 2. Streaming Response

```bash
curl -X POST https://xpersona.co/api/v1/hf/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_xpersona_api_key" \
  -d '{
    "model": "Qwen/Qwen2.5-Coder-7B-Instruct:nscale",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true,
    "max_tokens": 256
  }'
```

### 3. Check Usage

```bash
curl https://xpersona.co/api/v1/hf/usage \
  -H "X-API-Key: your_xpersona_api_key"
```

**Response:**
```json
{
  "plan": "paid",
  "status": "active",
  "limits": {
    "contextCap": 16384,
    "maxOutputTokens": 512,
    "maxRequestsPerDay": 100,
    "maxOutputTokensPerMonth": 300000
  },
  "today": {
    "requestsUsed": 45,
    "requestsRemaining": 55,
    "requestsLimit": 100
  },
  "thisMonth": {
    "tokensOutput": 145000,
    "tokensRemaining": 155000,
    "tokensLimit": 300000,
    "estimatedCostUsd": 0.0725
  }
}
```

## Cost Estimation

Based on HF Inference pricing (~$0.0005 per 1K tokens):

**Trial Users (max 50K tokens/month):**
- Cost: ~$0.025 per user/month
- 1000 trial users: ~$25/month

**Paid Users (max 300K tokens/month):**
- Cost: ~$0.15 per user/month
- Revenue: $3/user/month
- **Margin: 95%** 🎉

Very safe pricing with plenty of margin!

## What's Implemented ✅

1. ✅ Database schema with migrations
2. ✅ Rate limiting (daily/monthly quotas, context limits)
3. ✅ Usage tracking and logging
4. ✅ OpenAI-compatible API endpoint
5. ✅ Streaming response support
6. ✅ Usage stats endpoint
7. ✅ Authentication via X-API-Key

## What's Still Needed 📝

1. **Stripe Integration**
   - Webhook handlers for subscription lifecycle
   - Checkout session creation for trial signup
   - Handle trial expiration and payment failures

2. **Frontend Updates**
   - Update PlaygroundClient with actual checkout flow
   - User settings page to view usage
   - Subscription management UI

3. **Admin Dashboard**
   - Monitor total usage across all users
   - View costs and revenue
   - Manage user subscriptions

4. **Tests**
   - Unit tests for rate limiting
   - Integration tests for API endpoints

## Next Steps

To complete the implementation:

1. **Run the migration:**
   ```bash
   npx drizzle-kit migrate
   ```

2. **Set up Stripe:**
   - Create a $3/month price in Stripe
   - Add webhook endpoint for subscription events
   - Implement checkout flow

3. **Create a subscription creation script** for testing:
   ```typescript
   // scripts/create-playground-subscription.ts
   await db.insert(playgroundSubscriptions).values({
     userId: "your_user_id",
     planTier: "trial",
     status: "trial",
     trialStartedAt: new Date(),
     trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
   });
   ```

4. **Test the endpoint:**
   ```bash
   # Get your API key from the dashboard, then:
   curl -X POST http://localhost:3000/api/v1/hf/chat/completions \
     -H "X-API-Key: your_key" \
     -H "Content-Type: application/json" \
     -d '{"model":"Qwen/Qwen2.5-Coder-7B-Instruct:nscale","messages":[{"role":"user","content":"Hello"}]}'
   ```

## VS Code Extension Features (Marketing + Build List)

The website now markets the VS Code extension as supporting the feature set below.  
This list is also the official build checklist for implementation tracking.

- [ ] **Auto Mode** - Automatically chooses the best workflow per prompt.
- [ ] **YOLO Mode** - High-speed mode for rapid experimentation and execution.
- [ ] **IDE Context** - Uses open files, selections, and workspace state in responses.
- [ ] **IDE Indexing** - Indexes the repository for deeper code-aware assistance.
- [ ] **History** - Saves and reuses previous chats, prompts, and outputs.
- [ ] **Multiple Agents** - Runs several specialized agents in parallel.
- [ ] **Add image** - Accepts image inputs (screenshots, mockups, diagrams) in prompt flows.
- [ ] **262,144 context window** - Supports long-context sessions for large codebases and threads.

### Rollout Notes

- These features are now represented in the Playground marketing UI under the VS Code Extension section.
- Engineering status should be updated by checking each item as implementation lands.

## Security Considerations

- All requests authenticated via API key
- Rate limits enforced at multiple levels
- Usage logged for audit trail
- No user data exposed in responses
- Master HF_TOKEN never exposed to users

## Performance

- Daily/monthly aggregates for fast quota checks (no counting on every request)
- Asynchronous usage logging (doesn't block response)
- Streaming support for real-time responses
- Efficient database queries with proper indexes
