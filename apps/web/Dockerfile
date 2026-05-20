FROM oven/bun:latest as builder

WORKDIR /app
COPY package.json ./
COPY apps/web/package.json ./apps/web/
RUN bun install

COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN bun run build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
