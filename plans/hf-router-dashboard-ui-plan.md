# HuggingFace Router Dashboard UI - Implementation Plan

## System Overview

### Account Integration ✓
The HF Router **IS** tied to user accounts through the following schema:

```
users (id) ←───→ playground_subscriptions (user_id)
                      ↓
                hf_usage_logs (user_id)
                hf_daily_usage (user_id)
                hf_monthly_usage (user_id)
```

**Key Tables:**
- `playground_subscriptions` - Stores user's plan tier (trial/paid) and subscription status
- `hf_usage_logs` - Every request logged with user_id
- `hf_daily_usage` - Daily aggregated usage for fast quota checks
- `hf_monthly_usage` - Monthly aggregated usage for monthly caps

### Current Plan Tiers

| Feature | Trial | Paid ($3/month) |
|---------|-------|-----------------|
| Requests/day | 30 | 100 |
| Context Cap | 8,000 tokens | 16,000 tokens |
| Max Output | 256 tokens | 512 tokens |
| Monthly Output Cap | 50,000 tokens | 300,000 tokens |

## UI/UX Design - "Bubbly Aesthetic"

### Visual Style
- **Colors**: Soft gradients (pink/purple/blue), glassmorphism effects
- **Shapes**: Rounded corners (2xl), circular progress indicators
- **Animations**: Gentle pulses, smooth progress bar transitions, floating bubbles
- **Typography**: Soft, friendly fonts with gradient text effects

### Component Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 AI Playground Quota                                      │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  ┌─────────────┐  ┌─────────────────────────────────────┐   │
│  │   PLAN      │  │  Daily Requests    [██████░░░░] 12/30 │   │
│  │   ┌───┐     │  │  └─ Resets in: 5h 23m                  │   │
│  │   │⭐ │     │  │                                        │   │
│  │   └───┘     │  │  Monthly Tokens    [████████░░] 45K/50K│   │
│  │   Trial     │  │  └─ $0.02 estimated cost               │   │
│  └─────────────┘  └─────────────────────────────────────┘   │
│                                                              │
│  [💫 Upgrade to Paid]  [📊 View Details]                     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### 1. Create Session-Based API Endpoint
**File**: `app/api/me/playground-usage/route.ts`

Purpose: Dashboard needs session-based auth (not API key like the external endpoint)

Response format:
```typescript
{
  plan: "trial" | "paid";
  status: "active" | "trial" | "cancelled" | "past_due";
  trialEndsAt?: string;
  billingPeriodEndsAt?: string;
  limits: {
    maxRequestsPerDay: number;
    maxOutputTokensPerMonth: number;
    contextCap: number;
    maxOutputTokens: number;
  };
  today: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
  };
  thisMonth: {
    tokensOutput: number;
    tokensRemaining: number;
    tokensLimit: number;
    estimatedCostUsd: number;
  };
  nextResetAt: string; // UTC midnight for daily reset
}
```

### 2. Create PlaygroundQuotaCard Component
**File**: `components/dashboard/PlaygroundQuotaCard.tsx`

Features:
- **Animated Progress Bars**: Smooth transitions using Framer Motion
- **Gradient Backgrounds**: Soft pink/purple/blue gradients
- **Floating Bubble Effects**: Decorative animated circles
- **Countdown Timer**: Shows time until daily reset (midnight UTC)
- **Plan Badge**: Visual indicator of current plan (trial/paid)
- **Usage Stats**: Clear display of current usage vs limits

### 3. Visual Design Details

**Color Palette:**
```css
/* Primary Gradient */
--gradient-bubble: linear-gradient(135deg, #ff6b9d 0%, #c44fd1 50%, #7c3aed 100%);

/* Progress Bar Gradients */
--progress-high: linear-gradient(90deg, #30d158 0%, #34c759 100%);
--progress-medium: linear-gradient(90deg, #ff9500 0%, #ffcc00 100%);
--progress-low: linear-gradient(90deg, #ff3b30 0%, #ff6b6b 100%);

/* Glassmorphism */
--glass-bg: rgba(255, 255, 255, 0.05);
--glass-border: rgba(255, 255, 255, 0.1);
```

**Animations:**
- Progress bars: `transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1)`
- Pulse effect on plan badge: `animation: pulse 2s infinite`
- Floating bubbles: `animation: float 6s ease-in-out infinite`
- Countdown: Updates every second with smooth fade

### 4. Integration into Dashboard

Add the component to `app/(dashboard)/dashboard/page.tsx` in the Stats Row section.

### 5. Countdown Timer Logic

The daily quota resets at **midnight UTC**. The countdown should calculate:
```typescript
const now = new Date();
const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
const msUntilReset = tomorrow.getTime() - now.getTime();
const hours = Math.floor(msUntilReset / (1000 * 60 * 60));
const minutes = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60));
```

## File Structure

```
app/
  api/
    me/
      playground-usage/
        route.ts          # Session-based usage stats endpoint

components/
  dashboard/
    PlaygroundQuotaCard.tsx   # Main quota display component

lib/
  hf-router/
    rate-limit.ts        # Existing - already has getUserUsageStats
```

## API Endpoints Summary

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `/api/v1/hf/usage` | X-API-Key | External API for VS Code extension |
| `/api/me/playground-usage` | Session Cookie | Dashboard UI (new) |

## Marketing Angles

The component serves as a **marketing tool** by:
1. Making usage limits visible and tangible
2. Creating urgency with countdown timer
3. Showcasing the "AI Playground" branding
4. Providing clear upgrade CTA when limits are approached
5. Using delightful animations to create positive associations

## Success Metrics

- Users can clearly see remaining quota at a glance
- Visual feedback when approaching limits (color changes)
- Smooth animations without performance impact
- Accurate countdown timer that updates in real-time
