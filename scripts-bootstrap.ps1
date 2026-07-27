$ErrorActionPreference = "Stop"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run db:generate
docker compose up -d postgres mosquitto
npm run db:migrate
npm run db:seed
Write-Host "Bootstrap complete. Start the web app with: npm run dev:web"
