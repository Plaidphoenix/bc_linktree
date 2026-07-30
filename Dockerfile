FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY worker ./worker
COPY server ./server
COPY scripts ./scripts
COPY migrations ./migrations
RUN npm run build:selfhosted

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --gid 10001 linkgov \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin linkgov \
    && install -d -o linkgov -g linkgov -m 0750 /var/lib/linkgov/assets

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --from=build --chown=linkgov:linkgov /app/dist ./dist
COPY --from=build --chown=linkgov:linkgov /app/dist-server ./dist-server

USER linkgov
EXPOSE 8787
CMD ["node", "dist-server/index.mjs"]
