FROM node:25.6.0-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends procps curl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /home/node/app
COPY --from=deps /home/node/app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /home/node/app
ENV NODE_ENV=production
USER node
COPY --from=builder /home/node/app/dist ./dist
COPY --from=builder /home/node/app/node_modules ./node_modules
COPY --from=builder /home/node/app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
