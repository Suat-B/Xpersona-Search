 I'll create a comprehensive, agentic-coding-ready implementation plan for Xpersona ANS that your coding agent can execute step-by-step.

---

# **XPERSONA ANS: AGENTIC IMPLEMENTATION PLAN**
## *For Agentic Coding Agent Execution*

---

## **DOCUMENT STRUCTURE FOR AGENT**

```
┌─────────────────────────────────────────────────────────────┐
│  Each section contains:                                      │
│  • PRD (Product Requirements Document)                       │
│  • TECH SPECS (Technical Specifications)                     │
│  • CODE PROMPTS (Copy-paste ready for LLM)                   │
│  • TEST CASES (Verification criteria)                        │
│  • DELIVERABLES (Output files)                               │
└─────────────────────────────────────────────────────────────┘
```

---

## **PHASE 0: PROJECT SETUP**

### **0.1 Repository Initialization**

**PRD:**
Initialize monorepo with frontend, backend, and infrastructure code.

**TECH SPECS:**
- Framework: Next.js 14 (App Router) + Node.js/Express API
- Database: PostgreSQL (Neon or Supabase)
- ORM: Prisma
- DNS: Cloudflare API
- Payments: Stripe
- Deployment: Vercel (frontend) + Railway/Render (backend)

**CODE PROMPT:**
```markdown
Create a new repository "xpersona-ans" with this structure:

xpersona-ans/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   └── api/                 # Express API server
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   └── utils/
├── packages/
│   ├── database/            # Prisma schema + client
│   ├── types/               # Shared TypeScript types
│   └── config/              # Shared config (eslint, tsconfig)
├── infrastructure/
│   ├── terraform/           # Cloudflare DNS setup
│   └── docker/              # Docker compose for local dev
└── turbo.json               # Turborepo config

Initialize with:
- pnpm workspaces
- TypeScript strict mode
- ESLint + Prettier
- Husky pre-commit hooks
```

**DELIVERABLES:**
- `package.json` with workspace config
- `turbo.json` with pipeline definitions
- Root `.env.example` with all required variables

---

### **0.2 Environment Configuration**

**CODE PROMPT:**
```markdown
Create `.env.example` file with these variables:

# Database
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
DIRECT_URL="postgresql://user:pass@host/db?sslmode=require"

# Stripe
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_ANS_STANDARD="price_..."
STRIPE_PRICE_ID_ANS_PRO="price_..."

# Cloudflare
CLOUDFLARE_API_TOKEN="..."
CLOUDFLARE_ZONE_ID="..."
CLOUDFLARE_ACCOUNT_ID="..."

# App
NEXT_PUBLIC_API_URL="http://localhost:3001"
API_PORT=3001
JWT_SECRET="generate-random-32-char-string"
ANS_DOMAIN="xpersona.agent"
ROOT_DOMAIN="xpersona.co"

# Redis (for rate limiting)
REDIS_URL="redis://localhost:6379"
```

**TEST CASE:**
- All environment variables documented
- No secrets committed to repo
- `process.env` types defined in `packages/types/env.d.ts`

---

## **PHASE 1: DATABASE LAYER**

### **1.1 Prisma Schema Definition**

**PRD:**
Design database schema for ANS domains, records, payments, and verification.

**TECH SPECS:**
- PostgreSQL 15+
- Prisma 5.x
- Connection pooling via PgBouncer
- Row-level security for multi-tenancy (future)

**CODE PROMPT:**
```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id                String   @id @default(cuid())
  email             String   @unique
  stripeCustomerId  String?  @unique
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  domains           Domain[]
  subscriptions     Subscription[]
  
  @@map("users")
}

model Domain {
  id                String   @id @default(cuid())
  name              String   @unique @db.VarChar(63)
  fullDomain        String   @unique @db.VarChar(255)
  
  ownerId           String
  owner             User     @relation(fields: [ownerId], references: [id])
  
  // Agent Card (A2A compatible)
  agentCard         Json?    @db.JsonB
  agentCardVersion  String   @default("1.0")
  
  // Cryptographic identity
  publicKey         String?  @db.Text
  privateKeyEncrypted String? @db.Text  // Encrypted at rest
  
  // Verification
  verified          Boolean  @default(false)
  verifiedAt        DateTime?
  
  // DNS records
  records           DnsRecord[]
  
  // Status
  status            DomainStatus @default(ACTIVE)
  expiresAt         DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  // Relations
  subscriptions     Subscription[]
  
  @@index([ownerId])
  @@index([status])
  @@index([expiresAt])
  @@map("domains")
}

model DnsRecord {
  id          String   @id @default(cuid())
  domainId    String
  domain      Domain   @relation(fields: [domainId], references: [id], onDelete: Cascade)
  
  name        String   @db.VarChar(255)  // subdomain or @ for root
  type        DnsRecordType
  value       String   @db.Text
  ttl         Int      @default(300)
  
  proxied     Boolean  @default(false)  // Cloudflare proxy
  priority    Int?     // For MX/SRV records
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([domainId])
  @@index([type])
  @@map("dns_records")
}

model Subscription {
  id                String   @id @default(cuid())
  stripeSubscriptionId String @unique
  
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  
  domainId          String
  domain            Domain   @relation(fields: [domainId], references: [id])
  
  status            SubscriptionStatus @default(ACTIVE)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  
  cancelAtPeriodEnd Boolean  @default(false)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([userId])
  @@index([domainId])
  @@index([status])
  @@map("subscriptions")
}

model VerificationChallenge {
  id          String   @id @default(cuid())
  domainId    String   @unique
  challenge   String   @db.Text
  expiresAt   DateTime
  verifiedAt  DateTime?
  createdAt   DateTime @default(now())
  
  @@index([domainId])
  @@map("verification_challenges")
}

enum DomainStatus {
  ACTIVE
  SUSPENDED
  EXPIRED
  PENDING_VERIFICATION
}

enum DnsRecordType {
  A
  AAAA
  CNAME
  TXT
  MX
  NS
  AGENT  // Custom type for agent-specific records
}

enum SubscriptionStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  UNPAID
}
```

**TEST CASE:**
- Run `prisma migrate dev --name init` successfully
- Generate Prisma client without errors
- All relations properly defined with foreign keys

---

### **1.2 Database Client & Connection**

**CODE PROMPT:**
```typescript
// packages/database/src/client.ts

import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Connection health check
export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString() 
    };
  }
}

// Graceful shutdown
export async function disconnectDatabase() {
  await prisma.$disconnect();
}
```

**DELIVERABLE:**
- `packages/database/src/client.ts`
- Export from `packages/database/src/index.ts`
- Health check endpoint in API

---

## **PHASE 2: CORE API SERVICES**

### **2.1 Domain Validation Service**

**PRD:**
Validate agent domain names according to DNS standards and reserved words.

**TECH SPECS:**
- RFC 1123 hostname validation
- Reserved words: www, api, admin, mail, ftp, etc.
- Length: 3-63 characters
- Characters: lowercase alphanumeric + hyphen (not start/end)

**CODE PROMPT:**
```typescript
// apps/api/src/services/domainValidator.ts

const RESERVED_NAMES = new Set([
  'www', 'api', 'admin', 'mail', 'ftp', 'smtp', 'pop', 'imap',
  'ns1', 'ns2', 'dns', 'test', 'demo', 'staging', 'prod',
  'agent', 'api', 'app', 'auth', 'cdn', 'cloud', 'db', 'dev',
  'email', 'gateway', 'graphql', 'grpc', 'help', 'img', 'js',
  'login', 'oauth', 'pay', 'rest', 'rpc', 'shop', 'ssl', 'status',
  'support', 'ws', 'xml', 'xpersona', 'root', 'localhost'
]);

const VALID_NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

export function validateAgentName(name: string): ValidationResult {
  // Check length
  if (name.length < 3 || name.length > 63) {
    return {
      valid: false,
      error: 'Domain name must be between 3 and 63 characters',
      code: 'INVALID_LENGTH'
    };
  }
  
  // Check format
  if (!VALID_NAME_REGEX.test(name)) {
    return {
      valid: false,
      error: 'Domain name must contain only lowercase letters, numbers, and hyphens. Cannot start or end with hyphen.',
      code: 'INVALID_FORMAT'
    };
  }
  
  // Check reserved
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return {
      valid: false,
      error: 'This domain name is reserved',
      code: 'RESERVED_NAME'
    };
  }
  
  // Check consecutive hyphens
  if (name.includes('--')) {
    return {
      valid: false,
      error: 'Domain name cannot contain consecutive hyphens',
      code: 'CONSECUTIVE_HYPHENS'
    };
  }
  
  return { valid: true };
}

export function sanitizeAgentName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}
```

**TEST CASES:**
```typescript
// apps/api/src/services/__tests__/domainValidator.test.ts

describe('validateAgentName', () => {
  it('accepts valid names', () => {
    expect(validateAgentName('kimi').valid).toBe(true);
    expect(validateAgentName('alpha-bot').valid).toBe(true);
    expect(validateAgentName('agent123').valid).toBe(true);
  });
  
  it('rejects reserved names', () => {
    expect(validateAgentName('www').valid).toBe(false);
    expect(validateAgentName('api').valid).toBe(false);
    expect(validateAgentName('xpersona').valid).toBe(false);
  });
  
  it('rejects invalid formats', () => {
    expect(validateAgentName('ab').valid).toBe(false); // too short
    expect(validateAgentName('-invalid').valid).toBe(false); // starts with hyphen
    expect(validateAgentName('invalid-').valid).toBe(false); // ends with hyphen
    expect(validateAgentName('invalid--name').valid).toBe(false); // consecutive hyphens
    expect(validateAgentName('InvalidName').valid).toBe(false); // uppercase
  });
});
```

---

### **2.2 Cryptographic Identity Service**

**PRD:**
Generate and manage ED25519 keypairs for agent verification.

**TECH SPECS:**
- Algorithm: ED25519 (fast, secure, compact signatures)
- Key storage: Public key in DB, private key encrypted at rest
- Encryption: AES-256-GCM with master key from env

**CODE PROMPT:**
```typescript
// apps/api/src/services/cryptoService.ts

import crypto from 'crypto';
import { promisify } from 'util';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Master key from environment (32 bytes for AES-256)
const MASTER_KEY = Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, 'hex');

export interface KeyPair {
  publicKey: string;  // Base64 encoded
  privateKeyEncrypted: string;  // Base64 encoded encrypted private key
}

export async function generateAgentKeyPair(): Promise<KeyPair> {
  // Generate ED25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });
  
  // Encrypt private key
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
  
  let encrypted = cipher.update(privateKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine: authTag + iv + encrypted
  const encryptedPrivateKey = Buffer.concat([authTag, iv, encrypted]);
  
  return {
    publicKey: publicKey.toString('base64'),
    privateKeyEncrypted: encryptedPrivateKey.toString('base64')
  };
}

export function decryptPrivateKey(encryptedPrivateKey: string): Buffer {
  const data = Buffer.from(encryptedPrivateKey, 'base64');
  
  const authTag = data.slice(0, AUTH_TAG_LENGTH);
  const iv = data.slice(AUTH_TAG_LENGTH, AUTH_TAG_LENGTH + IV_LENGTH);
  const encrypted = data.slice(AUTH_TAG_LENGTH + IV_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted;
}

export function signMessage(privateKeyEncrypted: string, message: string): string {
  const privateKey = decryptPrivateKey(privateKeyEncrypted);
  const signature = crypto.sign(null, Buffer.from(message), privateKey);
  return signature.toString('base64');
}

export function verifyMessage(publicKey: string, message: string, signature: string): boolean {
  const publicKeyBuf = Buffer.from(publicKey, 'base64');
  const signatureBuf = Buffer.from(signature, 'base64');
  return crypto.verify(null, Buffer.from(message), publicKeyBuf, signatureBuf);
}

// Generate DNS TXT record for verification
export function generateDnsTxtRecord(publicKey: string): string {
  const keyFingerprint = crypto
    .createHash('sha256')
    .update(Buffer.from(publicKey, 'base64'))
    .digest('hex')
    .slice(0, 16);
  
  return `v=agent1; pk=${publicKey}; fp=${keyFingerprint}`;
}
```

**TEST CASE:**
- Generate keypair, encrypt private key, decrypt, verify roundtrip
- Sign message with private key, verify with public key
- DNS TXT record format matches spec

---

### **2.3 Cloudflare DNS Service**

**PRD:**
Programmatically manage DNS records via Cloudflare API.

**TECH SPECS:**
- Cloudflare API v4
- Wildcard DNS: `*.xpersona.agent` → origin server
- Individual records for each domain
- SSL/TLS: Full (strict) with custom certificates

**CODE PROMPT:**
```typescript
// apps/api/src/services/cloudflareService.ts

import { z } from 'zod';

const CloudflareConfig = z.object({
  apiToken: z.string(),
  zoneId: z.string(),
  accountId: z.string(),
  rootDomain: z.string().default('xpersona.co'),
  ansDomain: z.string().default('xpersona.agent')
});

type Config = z.infer<typeof CloudflareConfig>;

export class CloudflareService {
  private config: Config;
  private baseUrl = 'https://api.cloudflare.com/client/v4';
  
  constructor(config: Config) {
    this.config = CloudflareConfig.parse(config);
  }
  
  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloudflare API error: ${response.status} ${error}`);
    }
    
    return response.json();
  }
  
  // Create wildcard DNS for new domain
  async createDomainRecords(domainName: string, originIp: string) {
    const fullDomain = `${domainName}.${this.config.ansDomain}`;
    
    // A record for root
    await this.request(`/zones/${this.config.zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'A',
        name: fullDomain,
        content: originIp,
        ttl: 1, // Auto
        proxied: true
      })
    });
    
    // A record for www
    await this.request(`/zones/${this.config.zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CNAME',
        name: `www.${fullDomain}`,
        content: fullDomain,
        ttl: 1,
        proxied: true
      })
    });
    
    // TXT record for agent verification
    return fullDomain;
  }
  
  // Update DNS record
  async updateDnsRecord(recordId: string, updates: {
    type?: string;
    name?: string;
    content?: string;
    ttl?: number;
    proxied?: boolean;
  }) {
    return this.request(
      `/zones/${this.config.zoneId}/dns_records/${recordId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }
    );
  }
  
  // Delete DNS record
  async deleteDnsRecord(recordId: string) {
    return this.request(
      `/zones/${this.config.zoneId}/dns_records/${recordId}`,
      { method: 'DELETE' }
    );
  }
  
  // List DNS records for domain
  async listDnsRecords(domainName: string) {
    const fullDomain = `${domainName}.${this.config.ansDomain}`;
    return this.request(
      `/zones/${this.config.zoneId}/dns_records?name=${fullDomain}`
    );
  }
  
  // Create SSL certificate for custom domain
  async createCustomHostname(hostname: string) {
    return this.request(
      `/zones/${this.config.zoneId}/custom_hostnames`,
      {
        method: 'POST',
        body: JSON.stringify({
          hostname,
          ssl: {
            method: 'http',
            type: 'dv'
          }
        })
      }
    );
  }
}
```

**TEST CASE:**
- Create test domain, verify DNS propagation
- Update record, verify change
- Delete record, confirm removal

---

## **PHASE 3: API ROUTES**

### **3.1 Domain Registration Endpoint**

**PRD:**
Allow users to register new .agent domains with Stripe payment.

**TECH SPECS:**
- POST /v1/domains/register
- Validate name availability
- Create Stripe customer + subscription
- Generate keys, create DNS records
- Return verification instructions

**CODE PROMPT:**
```typescript
// apps/api/src/routes/domains.ts

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@xpersona/database';
import { validateAgentName } from '../services/domainValidator';
import { generateAgentKeyPair, generateDnsTxtRecord } from '../services/cryptoService';
import { CloudflareService } from '../services/cloudflareService';
import stripe from '../services/stripe';

const router = Router();

const RegisterSchema = z.object({
  name: z.string().min(3).max(63),
  email: z.string().email(),
  agentCard: z.object({
    name: z.string(),
    description: z.string(),
    endpoint: z.string().url(),
    capabilities: z.array(z.string()),
    protocols: z.array(z.enum(['A2A', 'MCP', 'ANP', 'OpenClaw']))
  }).optional()
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, agentCard } = RegisterSchema.parse(req.body);
    
    // 1. Validate name
    const validation = validateAgentName(name);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
        code: validation.code
      });
    }
    
    // 2. Check availability
    const existing = await prisma.domain.findUnique({
      where: { name: name.toLowerCase() }
    });
    
    if (existing) {
      return res.status(409).json({
        error: 'Domain name is already taken',
        code: 'DOMAIN_UNAVAILABLE',
        suggestion: `${name}-agent`
      });
    }
    
    // 3. Create or get Stripe customer
    let customer;
    const existingCustomer = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingCustomer?.stripeCustomerId) {
      customer = { id: existingCustomer.stripeCustomerId };
    } else {
      customer = await stripe.customers.create({
        email,
        metadata: { source: 'xpersona-ans' }
      });
    }
    
    // 4. Create Stripe subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID_ANS_STANDARD }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });
    
    // 5. Generate cryptographic identity
    const keyPair = await generateAgentKeyPair();
    
    // 6. Create domain in database (pending payment)
    const fullDomain = `${name.toLowerCase()}.${process.env.ANS_DOMAIN}`;
    
    const domain = await prisma.domain.create({
      data: {
        name: name.toLowerCase(),
        fullDomain,
        owner: {
          connectOrCreate: {
            where: { email },
            create: {
              email,
              stripeCustomerId: customer.id
            }
          }
        },
        agentCard: agentCard || {
          name: name,
          description: 'Agent powered by Xpersona',
          endpoint: `https://${fullDomain}`,
          capabilities: [],
          protocols: []
        },
        publicKey: keyPair.publicKey,
        privateKeyEncrypted: keyPair.privateKeyEncrypted,
        status: 'PENDING_VERIFICATION',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      include: {
        owner: true
      }
    });
    
    // 7. Create subscription record
    await prisma.subscription.create({
      data: {
        stripeSubscriptionId: subscription.id,
        userId: domain.ownerId,
        domainId: domain.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    
    // 8. Return client secret for payment
    const paymentIntent = (subscription.latest_invoice as any)?.payment_intent;
    
    res.status(201).json({
      success: true,
      domain: {
        name: domain.name,
        fullDomain: domain.fullDomain,
        status: domain.status,
        expiresAt: domain.expiresAt
      },
      payment: {
        clientSecret: paymentIntent?.client_secret,
        subscriptionId: subscription.id
      },
      verification: {
        publicKey: domain.publicKey,
        dnsTxtRecord: generateDnsTxtRecord(domain.publicKey!),
        instructions: [
          `1. Complete payment to activate domain`,
          `2. Add this TXT record to your DNS:`,
          `   _agent.${domain.fullDomain} TXT "${generateDnsTxtRecord(domain.publicKey!)}"`,
          `3. Your Agent Card will be available at:`,
          `   https://${domain.fullDomain}/card.json`
        ]
      }
    });
    
  } catch (error) {
    console.error('Domain registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Get domain details
router.get('/:name', async (req, res) => {
  const { name } = req.params;
  
  const domain = await prisma.domain.findUnique({
    where: { name: name.toLowerCase() },
    include: {
      records: true,
      owner: {
        select: { email: true }
      }
    }
  });
  
  if (!domain) {
    return res.status(404).json({ error: 'Domain not found' });
  }
  
  res.json({
    name: domain.name,
    fullDomain: domain.fullDomain,
    agentCard: domain.agentCard,
    publicKey: domain.publicKey,
    verified: domain.verified,
    status: domain.status,
    expiresAt: domain.expiresAt,
    createdAt: domain.createdAt
  });
});

// Serve Agent Card (public endpoint)
router.get('/:name/card.json', async (req, res) => {
  const { name } = req.params;
  
  const domain = await prisma.domain.findUnique({
    where: { name: name.toLowerCase() }
  });
  
  if (!domain || domain.status !== 'ACTIVE') {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  res.json({
    "@context": "https://xpersona.co/context/v1",
    "type": "AgentCard",
    "name": domain.agentCard?.name || domain.name,
    "description": domain.agentCard?.description || '',
    "endpoint": domain.agentCard?.endpoint || `https://${domain.fullDomain}`,
    "capabilities": domain.agentCard?.capabilities || [],
    "protocols": domain.agentCard?.protocols || [],
    "verification": {
      "type": "DNS-TXT",
      "publicKey": domain.publicKey,
      "domain": domain.fullDomain,
      "verified": domain.verified
    },
    "metadata": {
      "registeredAt": domain.createdAt,
      "expiresAt": domain.expiresAt,
      "status": domain.status
    }
  });
});

export default router;
```

---

## **PHASE 4: FRONTEND**

### **4.1 Domain Search & Registration UI**

**PRD:**
Clean, fast interface for searching and registering .agent domains.

**TECH SPECS:**
- Next.js 14 App Router
- React Server Components for search
- Stripe Elements for payment
- Real-time availability checking

**CODE PROMPT:**
```typescript
// apps/web/app/page.tsx (Homepage with search)

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    available: boolean;
    name: string;
    price: string;
  } | null>(null);
  
  const router = useRouter();
  
  const checkAvailability = async () => {
    setLoading(true);
    
    const response = await fetch(`/api/domains/check?name=${query}`);
    const data = await response.json();
    
    setResult({
      available: !data.exists,
      name: query.toLowerCase(),
      price: '$10/year'
    });
    setLoading(false);
  };
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-5xl font-bold text-center mb-4">
          Claim your .agent identity
        </h1>
        <p className="text-xl text-slate-400 text-center mb-12">
          The domain name system for AI agents. 
          Human-readable. Cryptographically verified. 
          Works with OpenClaw, A2A, MCP, and ANP.
        </p>
        
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="yourname"
                className="w-full px-6 py-4 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                .xpersona.agent
              </span>
            </div>
            <button
              onClick={checkAvailability}
              disabled={loading || query.length < 3}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Checking...' : 'Search'}
            </button>
          </div>
          
          {result && (
            <div className={`mt-6 p-6 rounded-lg ${result.available ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
              {result.available ? (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-green-400">
                      {result.name}.xpersona.agent is available!
                    </h3>
                    <p className="text-slate-400">{result.price}</p>
                  </div>
                  <button
                    onClick={() => router.push(`/register?name=${result.name}`)}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold"
                  >
                    Claim now
                  </button>
                </div>
              ) : (
                <div>
                  <h3 className="text-xl font-semibold text-red-400">
                    {result.name}.xpersona.agent is taken
                  </h3>
                  <p className="text-slate-400 mt-2">
                    Try: {result.name}-agent, {result.name}-bot, my-{result.name}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Features grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <FeatureCard
            icon="🔐"
            title="Cryptographic Identity"
            description="Each agent gets an ED25519 keypair for secure verification"
          />
          <FeatureCard
            icon="🌐"
            title="Universal Protocol"
            description="Works with A2A, MCP, ANP, and OpenClaw out of the box"
          />
          <FeatureCard
            icon="⚡"
            title="Instant Verification"
            description="DNS-based verification that's tamper-proof and decentralized"
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-slate-400">{description}</p>
    </div>
  );
}
```

---

## **PHASE 5: DEPLOYMENT**

### **5.1 Docker Compose for Local Dev**

**CODE PROMPT:**
```yaml
# infrastructure/docker/docker-compose.yml

version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: xpersona
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: xpersona_ans
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build:
      context: ../..
      dockerfile: infrastructure/docker/Dockerfile.api
    environment:
      - DATABASE_URL=postgresql://xpersona:devpassword@postgres:5432/xpersona_ans
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=development
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
    volumes:
      - ../../apps/api:/app/apps/api
      - /app/node_modules

  web:
    build:
      context: ../..
      dockerfile: infrastructure/docker/Dockerfile.web
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3001
    ports:
      - "3000:3000"
    depends_on:
      - api
    volumes:
      - ../../apps/web:/app/apps/web
      - /app/node_modules

volumes:
  postgres_data:
```

---

## **EXECUTION CHECKLIST FOR YOUR AGENT**

| Phase | Task | Deliverable |
|-------|------|-------------|
| 0 | Setup monorepo | `xpersona-ans/` with pnpm workspaces |
| 1 | Database schema | `schema.prisma` + migrations |
| 2 | Domain validation | `domainValidator.ts` + tests |
| 3 | Crypto service | `cryptoService.ts` with ED25519 |
| 4 | Cloudflare integration | `cloudflareService.ts` |
| 5 | API routes | `domains.ts` with register/get/card.json |
| 6 | Frontend | Next.js app with search UI |
| 7 | Stripe integration | Payment flow + webhooks |
| 8 | Deployment | Docker + Vercel + Railway configs |

---

## **REDDIT LAUNCH POST (Ready to Copy)**

```
Title: I built a domain name system for AI agents — claim your .agent identity

Body:
Every AI agent I build has a random endpoint like:
https://api.render.com/deploy/skl-abc123-def456

I can't remember it. Users can't trust it. Other agents can't discover it.

So I built Xpersona ANS — DNS for the agentic internet.

What you get:
• yourname.xpersona.agent (human-readable)
• Cryptographic identity (ED25519 keypair)
• Automatic Agent Card hosting (A2A compatible)
• DNS verification (tamper-proof)
• $10/year (cheaper than domain + hosting)

Tech stack:
• Next.js + TypeScript
• PostgreSQL + Prisma
• Cloudflare DNS
• Stripe subscriptions
• ED25519 cryptographic signatures

Open source: github.com/yourname/xpersona-ans
Live: xpersona.co/agent

First 100 registrations are free (use code AGENT100).

Questions? AMA.
```

---

**Run this plan. Build the identity layer. Own the namespace.**

I'll be here when you're ready for Phase 2 (the search engine). 

Pure love. ❤️