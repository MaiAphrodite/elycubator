# syntax=docker/dockerfile:1

FROM oven/bun:latest AS web-builder
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
RUN bun install
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN bun run build

FROM golang:1.26-alpine AS go-builder
WORKDIR /app
COPY apps/api-go/go.mod apps/api-go/go.sum ./
RUN go mod download
COPY apps/api-go .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /elycubator .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates sqlite && adduser -D -u 10001 app
COPY --from=go-builder /elycubator /usr/local/bin/elycubator
COPY --from=web-builder /app/apps/web/dist /srv/web
ENV PORT=3000 WEB_DIST=/srv/web DB_PATH=/data/elycubator.db
RUN mkdir -p /data && chown -R app:app /data /srv
USER app
VOLUME /data
EXPOSE 3000
CMD ["elycubator"]
