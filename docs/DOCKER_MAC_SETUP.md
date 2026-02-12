# Docker Setup for Mac

xpersona uses Docker to run PostgreSQL locally. On Mac, use Docker Desktop.

## 1. Install Docker Desktop

1. Download **Docker Desktop for Mac**: https://www.docker.com/products/docker-desktop/
2. Choose the right build:
   - **Apple Silicon (M1/M2/M3)** → "Mac with Apple chip"
   - **Intel Mac** → "Mac with Intel chip"
3. Open the `.dmg`, drag Docker to Applications.
4. Launch Docker Desktop. Wait until the whale icon in the menu bar shows Docker is running.

## 2. Optional: Verify Docker

```bash
docker --version
docker compose version
```

You should see version output for both.

## 3. Start the database

From the project root:

```bash
chmod +x scripts/dev-db-setup.sh
./scripts/dev-db-setup.sh
```

Or use the npm script:

```bash
npm run setup
```

This will:

- Start PostgreSQL in a Docker container on port 5432
- Push the Drizzle schema to create tables

## 4. Environment

Ensure `.env.local` has:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xpersona
```

This matches the `docker-compose.yml` config. Same on Mac and PC.

## 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `docker: command not found` | Install Docker Desktop and ensure it's running |
| `Cannot connect to the Docker daemon` | Start Docker Desktop from Applications |
| Port 5432 already in use | Another Postgres is running. Stop it or change the port in `docker-compose.yml` |
| `permission denied` for script | Run `chmod +x scripts/dev-db-setup.sh` |

## Stop the database

```bash
docker compose down
```

## View logs

```bash
docker compose logs -f postgres
```
