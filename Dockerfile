# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- dependencias
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

# ------------------------------------------------- compilacion y ejecucion de tests
FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY client client
RUN npm run build

# --------------------------------------------------------- entorno de desarrollo
FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY . .
EXPOSE 3000 5173
CMD ["npm", "run", "dev"]

# ------------------------------------------- dependencias solo de produccion
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --ignore-scripts

# ------------------------------------------------------------------ ejecucion
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    CLIENT_DIR=/app/client/dist

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY shared/package.json ./shared/
COPY --from=build /app/shared/dist ./shared/dist
COPY server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/dist/index.js"]
