# VacciTrack

Система учёта вакцинации для медицинских учреждений.

## Стек

- **Backend:** NestJS + Prisma + PostgreSQL
- **Frontend:** React + Vite + Tailwind CSS
- **API:** tRPC (UI) + REST/Swagger (внешние интеграции, МИС)
- **Auth:** Keycloak + AD (LDAP)
- **Инфра:** Docker Compose + Nginx (TLS) + Proxmox

## Структура монорепо

```
apps/
  api/          NestJS backend (tRPC + REST)
  web/          React frontend
packages/
  db/           Prisma schema + клиент
  trpc/         Shared роутеры и типы
  pdf/          Генератор документов (063/у, сертификат)
infra/
  nginx/        nginx.conf + certs/
  keycloak/     realm export для импорта при старте
```

## Быстрый старт (dev)

```bash
pnpm install
cp apps/api/.env.example apps/api/.env  # заполнить

pnpm db:generate
pnpm db:migrate

pnpm dev
# API  → http://localhost:3001
# Web  → http://localhost:5173
# tRPC → http://localhost:3001/trpc
# Docs → http://localhost:3001/api/docs
```

## Деплой (prod)

```bash
cp apps/api/.env.example apps/api/.env
# Заполнить POSTGRES_PASSWORD, KEYCLOAK_SECRET, и т.д.

# Сгенерировать самоподписанный сертификат для интранета
mkdir -p infra/nginx/certs
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout infra/nginx/certs/vaccitrack.key \
  -out infra/nginx/certs/vaccitrack.crt \
  -subj "/CN=vaccitrack.lrc.local"

docker compose up -d
```

## API

- `/trpc/*` — tRPC (используется фронтендом)
- `/api/v1/*` — REST (внешние интеграции, МИС)
- `/api/docs` — Swagger UI

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `KEYCLOAK_URL` | URL Keycloak сервера |
| `KEYCLOAK_REALM` | Realm (по умолчанию: vaccitrack) |
| `KEYCLOAK_CLIENT_ID` | Client ID для API |
| `KEYCLOAK_SECRET` | Client secret |
| `PORT` | Порт API (по умолчанию: 3001) |
