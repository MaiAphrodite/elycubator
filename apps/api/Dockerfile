FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/
RUN bun install

COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/src ./apps/api/src

WORKDIR /app/apps/api
RUN bunx prisma generate || true

CMD ["bun", "run", "src/index.ts"]

EXPOSE 3000
