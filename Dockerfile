# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# install deps (prod + dev) to run esbuild
COPY package.json package-lock.json* ./
RUN npm ci

# compile server to JS bundle
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npm run build

# ---------- runtime stage ----------
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=9010 FUNCTIONS_DIR=/functions

# prod deps only (includes @swc-node/register)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# bring in the compiled bundle
COPY --from=build /app/dist ./dist

# expose & declare volume for handlers
EXPOSE 9010
VOLUME ["/functions"]

CMD ["node", "-r", "@swc-node/register/register", "dist/server.js"]
