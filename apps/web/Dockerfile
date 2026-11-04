# apps/web/Dockerfile
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
RUN npm run build -w @codehaunt/web

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS runtime
WORKDIR /app
ENV NODE_ENV=production
USER node
# copy built standalone app and static assets
COPY --from=build /app/apps/web/.next/standalone .
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
ENV HOSTNAME=0.0.0.0 PORT=3100
EXPOSE 3100
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3100/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","apps/web/server.js"]
