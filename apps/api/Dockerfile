FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/
RUN bun install

COPY apps/api ./apps/api

WORKDIR /app/apps/api
CMD ["bun", "run", "src/index.ts"]

EXPOSE 3000
