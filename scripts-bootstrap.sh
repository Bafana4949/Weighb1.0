#!/usr/bin/env sh
set -eu
[ -f .env ] || cp .env.example .env
npm install
npm run db:generate
docker compose up -d postgres mosquitto
npm run db:migrate
npm run db:seed
printf '%s\n' 'Bootstrap complete. Start the web app with: npm run dev:web'
