# Start Postgres with Docker and push schema. Run from project root.
# Prerequisite: Docker Desktop running.

Set-Location $PSScriptRoot\..

Write-Host "Starting PostgreSQL (Docker)..." -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker failed. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

Write-Host "Waiting for Postgres to be ready..." -ForegroundColor Cyan
$max = 30
for ($i = 0; $i -lt $max; $i++) {
    $r = docker compose exec -T postgres pg_isready -U postgres -d xpersona 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
}
if ($i -ge $max) {
    Write-Host "Postgres did not become ready." -ForegroundColor Red
    exit 1
}

Write-Host "Pushing database schema..." -ForegroundColor Cyan
npm run db:push
if ($LASTEXITCODE -ne 0) {
    Write-Host "db:push failed." -ForegroundColor Red
    exit 1
}

Write-Host "Done. Guest mode and auth should work. Restart the dev server if it was running." -ForegroundColor Green
