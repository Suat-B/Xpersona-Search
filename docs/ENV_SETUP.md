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
   ```powershell
   .\scripts\dev-db-setup.ps1
   ```
   This starts PostgreSQL in Docker and runs `npm run db:push` to create tables.
3. `.env.local` already has `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xpersona` which matches the container.

## Other required vars

- **DATABASE_URL** – PostgreSQL connection string (for users, credits, games).
- **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET** – For Google sign-in (optional if you only use guest).
- **STRIPE_SECRET_KEY** / **STRIPE_WEBHOOK_SECRET** – For credit packages (see [STRIPE_SETUP.md](./STRIPE_SETUP.md)).

After changing env, restart the dev server.
