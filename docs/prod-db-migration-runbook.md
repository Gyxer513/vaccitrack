# Production DB migration runbook

Этот порядок нужен для рабочей базы, где данные уже живые и могут быть частично перепутаны после импорта.

## Жесткие правила

- На prod не запускать `prisma migrate dev`.
- На prod не запускать `prisma db push`.
- Сначала делать дамп и прогонять миграции на восстановленной копии.
- Все data-fix скрипты должны быть идемпотентными: повторный запуск не должен дублировать организации, участки, календари, пациентов и прививки.
- Приложение на время schema/data migration лучше остановить или перевести в maintenance, но БД сначала проверить на копии.

## Локальный деплойный стенд

Поднимается отдельным compose-проектом, не конфликтует с другими контейнерами и не публикует Postgres наружу.

```powershell
docker compose --env-file .env.deploy-local -f docker-compose.deploy-local.yml build
docker compose --env-file .env.deploy-local -f docker-compose.deploy-local.yml --profile migrate run --rm migrate
docker compose --env-file .env.deploy-local -f docker-compose.deploy-local.yml up -d
```

URL: `http://localhost:18080`

Остановить только этот стенд:

```powershell
docker compose --env-file .env.deploy-local -f docker-compose.deploy-local.yml down
```

## Preflight для prod

1. Снять логическую копию базы:

```bash
pg_dump --format=custom --no-owner --no-acl --file vaccitrack_before_deploy.dump "$DATABASE_URL"
```

2. Восстановить копию в отдельную пустую базу:

```bash
createdb vaccitrack_rehearsal
pg_restore --clean --if-exists --no-owner --dbname vaccitrack_rehearsal vaccitrack_before_deploy.dump
```

3. На копии проверить состояние Prisma:

```bash
DATABASE_URL="postgresql://..." pnpm --filter @vaccitrack/db exec prisma migrate status
```

4. На копии применить schema migrations:

```bash
DATABASE_URL="postgresql://..." pnpm --filter @vaccitrack/db run db:migrate:deploy
```

5. На копии запустить data migration/import только для нужного отделения:

```bash
python scripts/migrate.py --dept KID --dbf /path/to/dbf --dsn "postgresql://..."
python scripts/migrate.py --dept ADULT --dbf /path/to/dbf --dsn "postgresql://..."
```

6. Проверить контрольные выборки: число организаций, sites по `KID/ADULT`, участки, пациенты без участка, пациенты с дублями ФИО+дата рождения, прививки без пациента, записи без vaccineSchedule.

## Prod rollout

1. Зафиксировать окно работ и запретить запись в приложение.
2. Снять свежий `pg_dump`.
3. Выполнить `prisma migrate status`.
4. Если нет drift/conflict, выполнить `prisma migrate deploy`.
5. Выполнить только проверенные data-fix/import скрипты.
6. Запустить API/Web.
7. Проверить вход, список пациентов, карточку пациента, формы 063/у, сертификат, формы 5/6 и план по участку.

## Rollback

Schema rollback вручную рискованный. Основной rollback для этой стадии:

1. Остановить приложение.
2. Восстановить дамп `vaccitrack_before_deploy.dump` в чистую базу или в заранее подготовленный standby.
3. Вернуть предыдущие образы API/Web.
4. Поднять приложение и проверить отчеты.
