# apps/docker-proxy/Dockerfile: Node built-ins only, so no npm install and nothing third-party beside the socket.
FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
WORKDIR /app
ENV NODE_ENV=production
COPY apps/docker-proxy/package.json ./
COPY apps/docker-proxy/src ./src
USER node
EXPOSE 2375
HEALTHCHECK CMD node -e "require('node:http').get('http://127.0.0.1:2375/_ping',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","--experimental-strip-types","src/main.ts"]
