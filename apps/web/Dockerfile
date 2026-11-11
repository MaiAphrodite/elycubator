FROM oven/bun:latest as builder

WORKDIR /app

COPY package.json ./
COPY apps/web/package.json ./apps/web/
RUN bun install

# Copy only the source files needed for building
COPY apps/web/tsconfig*.json ./apps/web/
COPY apps/web/vite.config.ts ./apps/web/
COPY apps/web/postcss.config.cjs ./apps/web/
COPY apps/web/index.html ./apps/web/
COPY apps/web/src ./apps/web/src

WORKDIR /app/apps/web
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN bun run build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
