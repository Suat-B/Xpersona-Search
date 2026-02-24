 I understand you want a developer agent profile with full customization like MySpace/2000s personal pages, plus verification linking agent to developer. Here's the complete breakdown:

---

# **DEVELOPER AGENT PROFILE: FULL ARCHITECTURE**
## *MySpace-Style Customizable Agent Pages with Verification*

---

## **CORE CONCEPT**

```
┌─────────────────────────────────────────────────────────────┐
│  xpersona.co/agent/suat  (Agent Page)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [CUSTOM HTML/CSS/JS - Developer Controlled]        │   │
│  │                                                     │   │
│  │  ┌─────────┐  ┌─────────────────────────────────┐  │   │
│  │  │ AVATAR  │  │ AGENT NAME                      │  │   │
│  │  │ GIF     │  │ "Suat's Alpha Trading Bot"      │  │   │
│  │  │ CUSTOM  │  │ [VERIFIED BADGE] [SAFETY: 98]   │  │   │
│  │  └─────────┘  └─────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  CUSTOM WIDGETS (Drag-drop positioned):     │   │   │
│  │  │  • Live performance chart                   │   │   │
│  │  │  • Music player (developer's theme song)    │   │   │
│  │  │  • Friend/agent network                     │   │   │
│  │  │  • Custom CSS animations                    │   │   │
│  │  │  • Embedded Twitch/YouTube                  │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  [SUBSCRIBE $49/mo] [FORK] [SHARE]                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [EDIT PAGE] - Only visible to verified developer          │
└─────────────────────────────────────────────────────────────┘
```

---

## **VERIFICATION SYSTEM: AGENT ↔ DEVELOPER**

### **The Problem**
Anyone can claim to own an agent. We need cryptographic proof.

### **The Solution: Three-Layer Verification**

| Layer | Method | Trust Level |
|-------|--------|-------------|
| **Bronze** | GitHub OAuth + repo access | "Claims ownership" |
| **Silver** | DNS TXT record challenge | "Controls domain" |
| **Gold** | Code signature verification | "Signed the code" |

---

### **Verification Flow**

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Developer Claims Agent                             │
├─────────────────────────────────────────────────────────────┤
│  Developer clicks "Claim Agent" on xpersona.co/agent/suat   │
│                                                             │
│  Options:                                                   │
│  A) I own the GitHub repo                                   │
│  B) I control the domain                                    │
│  C) I have the signing keys                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2A: GitHub Verification (Bronze)                      │
├─────────────────────────────────────────────────────────────┤
│  1. OAuth with GitHub                                       │
│  2. Verify repo access (must be owner/maintainer)           │
│  3. Check if GitHub email matches agent author in SKILL.md  │
│  4. Add xpersona.json to repo root:                         │
│     {                                                       │
│       "verified_by": "xpersona",                            │
│       "agent_id": "suat",                                   │
│       "verification_code": "abc123..."                      │
│     }                                                       │
│  5. Xpersona bot verifies file exists                       │
│                                                             │
│  Result: Bronze badge, can edit basic profile               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2B: Domain Verification (Silver)                      │
├─────────────────────────────────────────────────────────────┤
│  1. Developer adds DNS TXT record:                          │
│     _xpersona.suat.dev TXT "v=agent1; verify=abc123..."     │
│                                                             │
│  2. Xpersona queries DNS, confirms ownership                │
│                                                             │
│  3. Developer adds Agent Card at:                           │
│     https://suat.dev/agent.json                             │
│                                                             │
│  Result: Silver badge, can use custom domain, full edit     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2C: Cryptographic Verification (Gold)                 │
├─────────────────────────────────────────────────────────────┤
│  1. Developer signs agent code with ED25519 private key     │
│  2. Public key published in Agent Card                      │
│  3. Xpersona verifies signature matches code hash           │
│                                                             │
│  Result: Gold badge, "Verified Author", highest trust       │
└─────────────────────────────────────────────────────────────┘
```

---

## **DATABASE SCHEMA: VERIFICATION**

```prisma
// packages/database/prisma/schema.prisma

model Agent {
  id                String   @id @default(cuid())
  // ... existing fields ...
  
  // Verification
  verificationLevel VerificationLevel @default(NONE)
  verifiedAt        DateTime?
  verifiedBy        String?  // "github", "dns", "crypto", "manual"
  
  // GitHub verification
  githubUserId      String?
  githubUsername    String?
  githubRepo        String?
  
  // Domain verification
  customDomain      String?
  domainVerifiedAt  DateTime?
  
  // Cryptographic verification
  publicKey         String?  @db.Text
  signature         String?  @db.Text
  
  // Relations
  verifications     VerificationAttempt[]
  customizations    AgentCustomization?
  
  @@map("agents")
}

model VerificationAttempt {
  id          String   @id @default(cuid())
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  method      VerificationMethod
  status      VerificationStatus
  challenge   String?  // The code/TXT record to verify
  verifiedAt  DateTime?
  error       String?
  
  metadata    Json?    // GitHub user data, DNS response, etc.
  
  createdAt   DateTime @default(now())
  
  @@index([agentId])
  @@map("verification_attempts")
}

model AgentCustomization {
  id          String   @id @default(cuid())
  agentId     String   @unique
  agent       Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  // Custom HTML/CSS/JS (MySpace style)
  customHtml  String?  @db.Text
  customCss   String?  @db.Text
  customJs    String?  @db.Text
  
  // Widget configuration
  widgets     Json?    // [{type: "chart", position: {x,y,w,h}, config: {}}]
  
  // Visual customization
  theme       String   @default("dark")
  backgroundUrl String?
  musicUrl    String?  // MySpace nostalgia
  
  // Profile data
  displayName String?
  bio         String?  @db.Text
  location    String?
  website     String?
  
  // Social links (MySpace top 8 style)
  topAgents   String[] // Array of agent IDs (friend list)
  
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
  
  @@map("agent_customizations")
}

enum VerificationLevel {
  NONE
  BRONZE    // GitHub OAuth
  SILVER    // Domain DNS
  GOLD      // Cryptographic signature
  PLATINUM  // Manual review + all above
}

enum VerificationMethod {
  GITHUB_OAUTH
  DNS_TXT
  CRYPTO_SIGNATURE
  MANUAL_REVIEW
}

enum VerificationStatus {
  PENDING
  IN_PROGRESS
  VERIFIED
  FAILED
  EXPIRED
}
```

---

## **CUSTOM PAGE EDITOR: MYSPACE-STYLE**

### **The Editor Interface**

```
┌─────────────────────────────────────────────────────────────┐
│  Xpersona Agent Editor - suat.xpersona.co                   │
├─────────────────────────────────────────────────────────────┤
│  [Visual] [HTML] [CSS] [JS] [Preview] [Publish]            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WIDGET PALETTE (Drag to canvas)                    │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │  Text   │ │  Chart  │ │  Music  │ │ Friends │   │   │
│  │  │  Box    │ │ Live    │ │ Player  │ │  List   │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │  Video  │ │  Code   │ │  Stats  │ │ Custom  │   │   │
│  │  │ Embed   │ │ Snippet │ │  Card   │ │  HTML   │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CANVAS (What visitors see)                         │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  [HEADER: Name + Verified Badge + Safety]   │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  ┌────────────┐  ┌────────────────────────────┐   │   │
│  │  │            │  │  [LIVE PERFORMANCE CHART]  │   │   │
│  │  │  [AVATAR]  │  │  Real-time backtest data   │   │   │
│  │  │   (GIF)    │  └────────────────────────────┘   │   │
│  │  │            │  ┌────────────────────────────┐   │   │
│  │  │ [SUBSCRIBE]│  │  [AGENT DESCRIPTION]       │   │   │
│  │  │   [$49/mo] │  │  Custom HTML welcome msg   │   │   │
│  │  └────────────┘  └────────────────────────────┘   │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  [FRIENDS / TOP AGENTS]                     │   │   │
│  │  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐              │   │   │
│  │  │  │A1  │ │A2  │ │A3  │ │A4  │  (8 max)      │   │   │
│  │  │  └────┘ └────┘ └────┘ └────┘              │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  [CUSTOM HTML BLOCK]                        │   │   │
│  │  │  <marquee>🚀 To the moon! 🚀</marquee>      │   │   │
│  │  │  <script>confetti()</script>                │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CODE EDITOR (when [HTML] tab active)               │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ <div class="my-custom-header">              │   │   │
│  │  │   <h1 style="color: #ff00ff; font-family:   │   │   │
│  │  │     'Comic Sans'">Suat's Bot</h1>            │   │   │
│  │  │   <img src="https://my-cdn.com/animated.gif">│   │   │
│  │  │ </div>                                       │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### **Editor Components**

```typescript
// apps/web/components/AgentEditor/Editor.tsx

'use client';

import { useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';

interface Widget {
  id: string;
  type: 'text' | 'chart' | 'music' | 'friends' | 'video' | 'code' | 'stats' | 'custom';
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
}

export function AgentEditor({ agentId }: { agentId: string }) {
  const [activeTab, setActiveTab] = useState<'visual' | 'html' | 'css' | 'js' | 'preview'>('visual');
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [customHtml, setCustomHtml] = useState('');
  const [customCss, setCustomCss] = useState('');
  const [customJs, setCustomJs] = useState('');

  const saveCustomization = async () => {
    await fetch(`/api/agents/${agentId}/customization`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgets,
        customHtml,
        customCss,
        customJs,
        theme: 'custom'
      })
    });
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-4 p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold">Agent Editor: {agentId}</h1>
        
        <div className="flex gap-2 ml-auto">
          {(['visual', 'html', 'css', 'js', 'preview'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded ${
                activeTab === tab ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              {tab.toUpperCase()}
            </button>
          ))}
          
          <button
            onClick={saveCustomization}
            className="px-6 py-2 bg-green-600 rounded font-semibold"
          >
            Publish
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'visual' && (
          <VisualEditor 
            widgets={widgets} 
            setWidgets={setWidgets}
          />
        )}
        
        {activeTab === 'html' && (
          <CodeMirror
            value={customHtml}
            height="100%"
            theme="dark"
            extensions={[html()]}
            onChange={setCustomHtml}
          />
        )}
        
        {activeTab === 'css' && (
          <CodeMirror
            value={customCss}
            height="100%"
            theme="dark"
            extensions={[css()]}
            onChange={setCustomCss}
          />
        )}
        
        {activeTab === 'js' && (
          <CodeMirror
            value={customJs}
            height="100%"
            theme="dark"
            extensions={[javascript()]}
            onChange={setCustomJs}
          />
        )}
        
        {activeTab === 'preview' && (
          <PreviewMode 
            html={customHtml}
            css={customCss}
            js={customJs}
            widgets={widgets}
          />
        )}
      </div>
    </div>
  );
}

// Visual drag-drop editor
function VisualEditor({ widgets, setWidgets }: { 
  widgets: Widget[], 
  setWidgets: (w: Widget[]) => void 
}) {
  const widgetTypes = [
    { type: 'text', label: 'Text Box', icon: '📝' },
    { type: 'chart', label: 'Live Chart', icon: '📊' },
    { type: 'music', label: 'Music Player', icon: '🎵' },
    { type: 'friends', label: 'Friends List', icon: '👥' },
    { type: 'video', label: 'Video Embed', icon: '🎬' },
    { type: 'code', label: 'Code Snippet', icon: '💻' },
    { type: 'stats', label: 'Stats Card', icon: '📈' },
    { type: 'custom', label: 'Custom HTML', icon: '🔧' }
  ];

  return (
    <DndContext>
      <div className="flex h-full">
        {/* Widget Palette */}
        <div className="w-64 p-4 border-r border-slate-700 overflow-y-auto">
          <h3 className="font-semibold mb-4">Widgets</h3>
          <div className="grid grid-cols-2 gap-2">
            {widgetTypes.map(w => (
              <DraggableWidget key={w.type} type={w.type} label={w.label} icon={w.icon} />
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 p-4 bg-slate-800 relative">
          <Canvas widgets={widgets} setWidgets={setWidgets} />
        </div>
      </div>
    </DndContext>
  );
}

// Draggable widget component
function DraggableWidget({ type, label, icon }: { type: string; label: string; icon: string }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `widget-${type}`
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="p-3 bg-slate-700 rounded cursor-move hover:bg-slate-600"
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
```

---

## **AGENT PAGE RENDERER**

```typescript
// apps/web/app/agent/[slug]/page.tsx

import { prisma } from '@xpersona/database';
import { AgentProfile } from '../../../components/AgentProfile/AgentProfile';
import { CustomAgentPage } from '../../../components/AgentProfile/CustomAgentPage';

export default async function AgentPage({ params }: { params: { slug: string } }) {
  const agent = await prisma.agent.findUnique({
    where: { slug: params.slug },
    include: { customizations: true }
  });

  if (!agent) {
    return <div>Agent not found</div>;
  }

  // Check if developer has customized the page
  if (agent.customizations?.customHtml) {
    return (
      <CustomAgentPage 
        agent={agent}
        customization={agent.customizations}
      />
    );
  }

  // Default template
  return <AgentProfile agent={agent} />;
}

// Custom page with developer's HTML/CSS/JS
function CustomAgentPage({ agent, customization }: { 
  agent: any; 
  customization: any 
}) {
  // Sanitize and inject custom code
  const sanitizedHtml = sanitizeHtml(customization.customHtml);
  const sanitizedCss = customization.customCss;
  const sanitizedJs = sanitizeJs(customization.customJs);

  return (
    <div className="min-h-screen">
      {/* Inject custom CSS */}
      <style dangerouslySetInnerHTML={{ __html: sanitizedCss }} />
      
      {/* Xpersona header (always present for trust) */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">Xpersona</span>
          <span className="text-slate-400">/</span>
          <span>{agent.name}</span>
        </div>
        <VerificationBadge level={agent.verificationLevel} />
      </div>

      {/* Custom content */}
      <div 
        className="agent-custom-content"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />

      {/* Inject custom JS (sandboxed) */}
      <SandboxedScript code={sanitizedJs} />

      {/* Xpersona footer with subscribe button (always present) */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 p-4 text-center">
        <button className="px-8 py-3 bg-blue-600 rounded-lg font-semibold">
          Subscribe ${agent.price}/mo
        </button>
      </div>
    </div>
  );
}

// Sandboxed JavaScript execution
function SandboxedScript({ code }: { code: string }) {
  useEffect(() => {
    // Create isolated iframe for JS execution
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts';
    iframe.style.display = 'none';
    
    iframe.srcdoc = `
      <script>
        // Limited API available to custom JS
        const XpersonaAPI = {
          getAgentData: () => ${JSON.stringify(agent)},
          trackEvent: (name) => parent.postMessage({type: 'track', name}, '*')
        };
        
        try {
          ${code}
        } catch (e) {
          console.error('Agent page error:', e);
        }
      </script>
    `;
    
    document.body.appendChild(iframe);
    
    return () => {
      document.body.removeChild(iframe);
    };
  }, [code]);

  return null;
}
```

---

## **SANDBOXING & SECURITY**

```typescript
// apps/api/src/utils/sandbox.ts

import DOMPurify from 'isomorphic-dompurify';
import { JSDOM } from 'jsdom';

// Allowed HTML tags (MySpace-style but safe)
const ALLOWED_TAGS = [
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'br', 'hr', 'img', 'a', 'b', 'i', 'u', 's', 'strike',
  'font', 'center', 'marquee', 'blink', // 2000s nostalgia
  'table', 'tr', 'td', 'th', 'tbody', 'thead',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'iframe' // For YouTube embeds (sanitized)
];

const ALLOWED_ATTRS = [
  'style', 'class', 'id', 'href', 'src', 'alt', 'title',
  'width', 'height', 'border', 'cellpadding', 'cellspacing',
  'bgcolor', 'color', 'size', 'face', 'align', 'valign'
];

// Allowed CSS properties
const ALLOWED_CSS = [
  'color', 'background-color', 'background-image',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'text-transform',
  'margin', 'padding', 'border', 'width', 'height',
  'display', 'position', 'top', 'left', 'right', 'bottom',
  'z-index', 'overflow', 'float', 'clear',
  'animation', 'transition', 'transform'
];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true
  });
}

export function sanitizeCss(dirty: string): string {
  // Parse CSS and filter properties
  const dom = new JSDOM(`<style>${dirty}</style>`);
  const styleSheet = dom.window.document.styleSheets[0];
  
  let cleanCss = '';
  
  for (const rule of Array.from(styleSheet.cssRules)) {
    if (rule instanceof dom.window.CSSStyleRule) {
      const selector = rule.selectorText;
      const styles: string[] = [];
      
      for (let i = 0; i < rule.style.length; i++) {
        const prop = rule.style[i];
        if (ALLOWED_CSS.includes(prop)) {
          styles.push(`${prop}: ${rule.style.getPropertyValue(prop)}`);
        }
      }
      
      if (styles.length > 0) {
        cleanCss += `${selector} { ${styles.join('; ')} }\n`;
      }
    }
  }
  
  return cleanCss;
}

export function sanitizeJs(dirty: string): string {
  // Block dangerous patterns
  const dangerousPatterns = [
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /new\s+Function/gi,
    /document\.write/gi,
    /window\.location/gi,
    /fetch\s*\(/gi, // Block external requests
    /XMLHttpRequest/gi,
    /WebSocket/gi,
    /localStorage/gi,
    /sessionStorage/gi,
    /document\.cookie/gi
  ];
  
  let clean = dirty;
  for (const pattern of dangerousPatterns) {
    clean = clean.replace(pattern, '// blocked: ');
  }
  
  return clean;
}
```

---

## **API ENDPOINTS**

```typescript
// apps/api/src/routes/agents.ts

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@xpersona/database';
import { verifyGitHubOwnership } from '../verification/github';
import { verifyDnsChallenge } from '../verification/dns';
import { sanitizeHtml, sanitizeCss, sanitizeJs } from '../utils/sandbox';

const router = Router();

// Claim agent (start verification)
router.post('/:id/claim', async (req, res) => {
  const { method } = req.body; // 'github', 'dns', 'crypto'
  const agentId = req.params.id;
  
  // Generate verification challenge
  const challenge = crypto.randomBytes(32).toString('hex');
  
  const attempt = await prisma.verificationAttempt.create({
    data: {
      agentId,
      method: method.toUpperCase(),
      status: 'PENDING',
      challenge
    }
  });
  
  // Return instructions based on method
  switch (method) {
    case 'github':
      return res.json({
        method: 'github',
        instructions: [
          '1. Fork the agent repository',
          '2. Add xpersona.json to root:',
          JSON.stringify({ verification_code: challenge }, null, 2),
          '3. Submit PR or make public'
        ],
        oauthUrl: `/auth/github?state=${attempt.id}`
      });
      
    case 'dns':
      return res.json({
        method: 'dns',
        instructions: [
          `1. Add DNS TXT record:`,
          `_xpersona.${agentId}.yourdomain.com TXT "v=agent1; verify=${challenge}"`,
          `2. Wait for DNS propagation (5-60 min)`,
          `3. Click verify`
        ]
      });
  }
});

// Verify claim
router.post('/:id/verify', async (req, res) => {
  const { attemptId } = req.body;
  
  const attempt = await prisma.verificationAttempt.findUnique({
    where: { id: attemptId },
    include: { agent: true }
  });
  
  if (!attempt) {
    return res.status(404).json({ error: 'Attempt not found' });
  }
  
  let verified = false;
  let level = 'NONE';
  
  switch (attempt.method) {
    case 'GITHUB_OAUTH':
      verified = await verifyGitHubOwnership(attempt);
      level = 'BRONZE';
      break;
    case 'DNS_TXT':
      verified = await verifyDnsChallenge(attempt);
      level = 'SILVER';
      break;
  }
  
  if (verified) {
    await prisma.$transaction([
      prisma.verificationAttempt.update({
        where: { id: attemptId },
        data: { status: 'VERIFIED', verifiedAt: new Date() }
      }),
      prisma.agent.update({
        where: { id: attempt.agentId },
        data: { 
          verificationLevel: level,
          verifiedAt: new Date(),
          verifiedBy: attempt.method.toLowerCase()
        }
      })
    ]);
    
    return res.json({ success: true, level });
  }
  
  return res.status(400).json({ error: 'Verification failed' });
});

// Update customization
router.put('/:id/customization', async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.id; // From auth middleware
  
  // Verify user owns this agent
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: userId }
  });
  
  if (!agent) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  // Check verification level (need at least BRONZE to edit)
  if (agent.verificationLevel === 'NONE') {
    return res.status(403).json({ 
      error: 'Verify ownership before customizing',
      claimUrl: `/api/agents/${agentId}/claim`
    });
  }
  
  const { widgets, customHtml, customCss, customJs, theme } = req.body;
  
  // Sanitize all inputs
  const sanitized = {
    widgets,
    customHtml: sanitizeHtml(customHtml),
    customCss: sanitizeCss(customCss),
    customJs: sanitizeJs(customJs),
    theme
  };
  
  await prisma.agentCustomization.upsert({
    where: { agentId },
    update: sanitized,
    create: { agentId, ...sanitized }
  });
  
  res.json({ success: true });
});

export default router;
```

---

## **MYSPACE NOSTALGIA FEATURES**

| Feature | Implementation | Why |
|---------|---------------|-----|
| **Top 8 Friends** | Array of agent IDs, displayed as grid | Social proof, discovery |
| **Theme Music** | Auto-play audio (muted by default, 2000s style) | Nostalgia |
| **Marquee Text** | `<marquee>` tag allowed in HTML | Classic MySpace |
| **Custom Cursors** | CSS `cursor: url()` | Personalization |
| **Sparkles/Glitter** | CSS animations + GIFs | Aesthetic |
| **Visitor Counter** | Widget showing page views | Social proof |
| **"Online Now" Badge** | Real-time status indicator | Engagement |
| **Comment Wall** | User comments on agent page | Community |

---

## **LAUNCH POST (UPDATED)**

```
Title: I built MySpace for AI agents — customizable pages with crypto verification

Body:
Remember MySpace? Custom HTML, top 8 friends, music autoplay?

I built that for AI agents.

Xpersona now gives every agent developer:

1. VERIFIED OWNERSHIP
   • Bronze: GitHub OAuth
   • Silver: DNS TXT challenge  
   • Gold: Cryptographic signature
   Prove you built the agent, claim your page.

2. MYSPACE-STYLE CUSTOMIZATION
   • Drag-drop widget editor
   • Custom HTML/CSS/JS (sandboxed)
   • Top 8 "friend" agents
   • Theme music, glitter, marquees
   • Live performance widgets

3. YOUR AGENT, YOUR BRAND
   Default: xpersona.co/agent/suat
   Custom: suat.dev (with DNS verification)

Example custom pages:
• xpersona.co/agent/alphabreak (live trading chart, dark theme)
• xpersona.co/agent/whalehunter (neon 90s aesthetic, music)

The verification layer means users TRUST the custom page.
The customization layer means developers LOVE their page.

Try it: xpersona.co

Who's building an agent that needs a MySpace page?
```

---

**This is the full architecture. Build the verification, build the editor, launch the nostalgia.** ❤️