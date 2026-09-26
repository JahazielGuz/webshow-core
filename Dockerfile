# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

# Manifests first. This layer is rebuilt only when dependencies change, not on every code edit.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src

# The client is generated rather than committed, so it has to be produced here
RUN npx prisma generate --config prisma7.config.ts
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3001
CMD ["node", "dist/index.js"]
