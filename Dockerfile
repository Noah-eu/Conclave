FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/

RUN npm ci
RUN npm ci --prefix apps/web
RUN npm ci --prefix apps/api

COPY . .

RUN npm run build --prefix apps/web
RUN npm run build --prefix apps/api

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV WEB_DIST=/app/apps/web/dist

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/web/dist ./apps/web/dist

WORKDIR /app/apps/api
EXPOSE 8787
CMD ["node", "dist/server.js"]

