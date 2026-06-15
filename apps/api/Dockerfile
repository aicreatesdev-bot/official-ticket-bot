FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @rose-ticket/db prisma:generate
RUN pnpm --filter @rose-ticket/api build

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable
COPY --from=build /app ./
CMD ["pnpm", "--filter", "@rose-ticket/api", "start"]
