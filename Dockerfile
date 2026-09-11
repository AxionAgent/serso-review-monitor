FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
# git dibutuhkan vite.config appVersion() (versioning dari commit history)
RUN apk add --no-cache git
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
# ponytail: install devDeps too — drizzle-kit migrate + tsx seed run at container start
RUN pnpm install --frozen-lockfile
COPY --from=build /app/dist ./dist
# v2 static UI (esbuild bundle tdk meng-copy public dir)
COPY --from=build /app/server/v2/public ./dist/v2/public
# pastikan readable oleh runtime USER node
RUN chown -R node:node /app/dist
# drizzle-kit migrate (compose entrypoint) needs the config + migration SQL
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/drizzle ./drizzle
# seed.ts (tsx, runs once via compose entrypoint) needs server + shared source
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.json ./tsconfig.json
# COPY above lands as root:root — re-own so USER node can read (drizzle migrate + tsx seed)
RUN chown -R node:node /app/server /app/shared /app/drizzle.config.ts /app/tsconfig.json /app/drizzle

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]