# apps/worker/Dockerfile
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/docker-proxy/package.json ./apps/docker-proxy/
COPY packages/auth/package.json ./packages/auth/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/judge/package.json ./packages/judge/
# packages/db's postinstall runs prisma generate, which needs the schema and config.
COPY packages/db/package.json packages/db/prisma.config.ts ./packages/db/
COPY packages/db/prisma ./packages/db/prisma
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Docker CLI only (no daemon, no socket): it reaches the filtering docker-proxy via DOCKER_HOST (ADR-019).
COPY --from=docker:27-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c /usr/local/bin/docker /usr/local/bin/docker
# Root-owned, so a compromised worker cannot plant code in its own dependencies (audit F1).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/worker ./apps/worker
USER node
ENV WORKER_HEALTH_HOST=0.0.0.0
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3101/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--experimental-strip-types","apps/worker/src/main.ts"]
