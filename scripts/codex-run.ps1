$ErrorActionPreference = "Stop"

$bunHome = Join-Path $env:USERPROFILE ".bun\bin"
$bun = Join-Path $bunHome "bun.exe"

if (-not (Test-Path $bun)) {
  throw "Bun was not found at $bun. Install Bun first, then rerun this script."
}

$env:PATH = "$bunHome;$env:PATH"

& $bun install

if (-not (Test-Path ".env.local")) {
  & $bun x convex dev --once --configure new --dev-deployment cloud
} else {
  & $bun x convex dev --once
}

if (-not (Test-Path ".convex-auth.configured")) {
  & $bun x "@convex-dev/auth" --web-server-url "http://localhost:5173" --skip-git-check
  New-Item -ItemType File -Path ".convex-auth.configured" -Force | Out-Null
}

& $bun x convex dev --start "bun run dev"
