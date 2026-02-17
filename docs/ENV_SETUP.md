# Environment setup

Copy `.env.example` to `.env.local` and fill in values. `.env.local` is gitignored.

## Required for auth (including guest)

- **NEXTAUTH_SECRET** – Used by NextAuth for sessions and signing. Must be set (32+ chars).  
  Generate one: `openssl rand -base64 32` (or use the dev value in the generated `.env.local`; change in production).
- **NEXTAUTH_URL** – e.g. `http://localhost:3000` in development.

Without `NEXTAUTH_SECRET` you’ll see:  
`MissingSecret` / `?error=guest_failed&message=NEXTAUTH_SECRET+is+not+set`.

## Local database (Docker)

1. Start **Docker Desktop** (must be running).
2. From the project root run:
   - **Mac:** `./scripts/dev-db-setup.sh` (see [DOCKER_MAC_SETUP.md](./DOCKER_MAC_SETUP.md))
   - **Windows (PowerShell):** `.\scripts\dev-db-setup.ps1`
   - **Or:** `npm run setup` (works on both)
3. `.env.local` already has `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xpersona` which matches the container.

## Google OAuth (hands-off: `npm run setup:google`)

Run once to enable Google Sign-In:

```bash
npm run setup:google
```

This opens the Google Cloud Console, prompts for Client ID and Secret, writes `.env.local`, and prints the redirect URI to add. Restart your dev server after.

**Manual setup** (if you prefer):

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Add both (different requirements):
   - **Authorized JavaScript origins**: origin only, no path or trailing slash (e.g. `http://localhost:3000` or `https://xpersona.co`).
   - **Authorized redirect URIs**: full path (e.g. `http://localhost:3000/api/auth/callback/google`).
5. Copy Client ID and Secret into `.env.local`, or run `npm run setup:google` and paste when prompted.
6. Restart the dev server. "Sign in with Google" and "Upgrade to Google" will work.

## Other required vars

- **DATABASE_URL** – PostgreSQL connection string (for users, credits, games).
- **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET** – For Google sign-in (optional if you only use guest).
- **STRIPE_SECRET_KEY** / **STRIPE_WEBHOOK_SECRET** / **STRIPE_PRICE_*** – Run `npm run setup:stripe` for hands-off setup, or see [STRIPE_SETUP.md](./STRIPE_SETUP.md).

After changing env, restart the dev server.

## Production: "Server error" / `?error=Configuration` on xpersona.co

If "Upgrade to Google" or "Sign in with Google" redirects to `xpersona.co/api/auth/error?error=Configuration`, fix these:

### 1. Vercel environment variables

In **Vercel → Project → Settings → Environment Variables**, ensure these are set for **Production**:

| Variable | Value |
|----------|-------|
| `NEXTAUTH_URL` | `https://xpersona.co` (exactly, no trailing slash) |
| `NEXTAUTH_SECRET` | 32+ chars (generate: `openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` | Your OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your OAuth client secret |

### 2. Google Cloud Console

In **APIs & Services → Credentials → your OAuth client**:

- **Authorized JavaScript origins**: `https://xpersona.co` (no path, no trailing slash)
- **Authorized redirect URIs**: `https://xpersona.co/api/auth/callback/google`

### 3. Redeploy

After changing Vercel env vars: **Redeploy** (Vercel → Deployments → ⋮ → Redeploy, or push a new commit).
