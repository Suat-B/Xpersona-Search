#!/usr/bin/env bash
# Start Postgres with Docker and push schema. Run from project root.
# Prerequisite: Docker Desktop running (Mac/Intel or Mac/Apple Silicon).

set -e
cd "$(dirname "$0")/.."

echo "Starting PostgreSQL (Docker)..."
if ! docker compose up -d; then
  echo "Docker failed. Is Docker Desktop running?" >&2
  exit 1
fi

echo "Waiting for Postgres to be ready..."
max=30
for i in $(seq 1 $max); do
  if docker compose exec -T postgres pg_isready -U postgres -d xpersona 2>/dev/null; then
    break
  fi
  if [ "$i" -eq "$max" ]; then
    echo "Postgres did not become ready." >&2
    exit 1
  fi
  sleep 1
done

echo "Pushing database schema..."
npm run db:push

echo "Done. Guest mode and auth should work. Restart the dev server if it was running."
