# apps/gateway/Dockerfile. Dependencies are pure JS (contracts → zod), so `npm ci` runs on the build
# platform and the target-platform stage only copies files: the amd64 image builds on the arm64 DGX
# without emulation.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci --omit=dev --ignore-scripts -w @codehaunt/gateway -w @codehaunt/contracts

FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/gateway/src ./apps/gateway/src
USER node
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--experimental-strip-types","apps/gateway/src/main.ts"]
