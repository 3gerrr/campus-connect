# dev-up.ps1 — starts the local Docker Postgres (campus-pg) used for Phase 0
# development, so nobody has to remember `docker start campus-pg` after a
# laptop restart. Read-only beyond starting the container: no resets, no
# migrations, no data changes. See PHASE-0-CHECKLIST.md Step 3.
#
# Usage: ./dev-up.ps1

function Test-DockerRunning {
    try {
        docker info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

if (-not (Test-DockerRunning)) {
    Write-Host "Docker doesn't seem to be reachable. Open Docker Desktop first, then re-run ./dev-up.ps1" -ForegroundColor Red
    exit 1
}

$allContainers = @(docker ps -a --format "{{.Names}}" 2>$null)
if ($allContainers -notcontains 'campus-pg') {
    Write-Host "campus-pg container not found -- creating it on port 5433..."
    docker run --name campus-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres | Out-Null
} else {
    $runningContainers = @(docker ps --format "{{.Names}}" 2>$null)
    if ($runningContainers -notcontains 'campus-pg') {
        Write-Host "Starting existing campus-pg container..."
        docker start campus-pg | Out-Null
    } else {
        Write-Host "campus-pg is already running."
    }
}

Write-Host "Waiting for Postgres to accept connections..." -NoNewline
$maxAttempts = 30
$ready = $false
for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
    docker exec campus-pg pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 1
}
Write-Host ""

if (-not $ready) {
    Write-Host "Postgres did not become ready within $maxAttempts seconds. Check: docker logs campus-pg" -ForegroundColor Red
    exit 1
}

Write-Host "ready — run: cd backend; npm run start:dev" -ForegroundColor Green
