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

## Google OAuth (free, ~5 min)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) — create or select a project.
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` (add production URL later, e.g. `https://xpersona.co/api/auth/callback/google`).
5. Copy Client ID and Client Secret into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
6. Restart the dev server. The login page will show "Sign in with Google".

## Other required vars

- **DATABASE_URL** – PostgreSQL connection string (for users, credits, games).
- **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET** – For Google sign-in (optional if you only use guest).
- **STRIPE_SECRET_KEY** / **STRIPE_WEBHOOK_SECRET** – For credit packages (see [STRIPE_SETUP.md](./STRIPE_SETUP.md)).

After changing env, restart the dev server.
