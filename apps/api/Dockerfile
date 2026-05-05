FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/trpc/package.json ./packages/trpc/
COPY packages/pdf/package.json ./packages/pdf/
COPY apps/api/package.json ./apps/api/

FROM base AS deps
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @vaccitrack/db run db:generate
RUN pnpm --filter @vaccitrack/api run build

FROM node:20-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
COPY --from=build /app /app
CMD ["node", "--import", "tsx", "dist/main"]
