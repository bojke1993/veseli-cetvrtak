# syntax=docker/dockerfile:1.7
# One image: Node.js API + built React SPA + MySQL 8.4 (docs/design.md §11).

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY server server
COPY web web
RUN npm run build -w web && npm run build -w server
# Production dependencies of the server only
# (npm hoists workspace deps to the root; server/node_modules may not exist, but COPY below needs it)
RUN rm -rf node_modules && npm ci --omit=dev -w server && mkdir -p server/node_modules

FROM node:22-bookworm-slim AS node

FROM mysql:8.4
RUN (command -v gzip >/dev/null || microdnf install -y gzip) && (microdnf clean all || true)
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/server/node_modules ./server/node_modules
COPY --from=build /src/server/package.json ./server/package.json
COPY --from=build /src/server/dist ./server/dist
COPY --from=build /src/web/dist ./public
COPY docker/my.cnf /etc/mysql/conf.d/vc.cnf
COPY docker/entrypoint.sh /usr/local/bin/vc-entrypoint.sh
RUN chmod +x /usr/local/bin/vc-entrypoint.sh && mkdir -p /backups

ENV NODE_ENV=production \
    PORT=8080 \
    DB_HOST=127.0.0.1 \
    DB_PORT=3306 \
    DB_NAME=veseli_cetvrtak \
    DB_USER=vc \
    PUBLIC_DIR=/app/public \
    BACKUP_DIR=/backups \
    TZ=Europe/Belgrade

VOLUME ["/var/lib/mysql", "/backups"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/vc-entrypoint.sh"]
