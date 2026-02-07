# Project Compass Dev Scaffold

Bun-first development scaffold for Project Compass.

## Quick Start
1. `cp .env.example .env`
2. `bun install`
3. `scripts/infra.sh up` (starts Postgres + Redis)
4. `bun run dev`

Services:
- API: `http://localhost:3001`
- Worker: Redis-backed queue consumer
- Web app: `http://localhost:5173`

## Current Dev Architecture
- API: Fastify + PostgreSQL writes + Redis queue push
- Worker: Redis `BRPOP` queue + PostgreSQL processing state
- Web: React + Router polling API endpoints

## Placeholders
Auth/integration credentials are intentionally placeholders in `.env.example`.
