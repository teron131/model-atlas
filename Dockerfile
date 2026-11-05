# Shared Cloud Run runtime for benchmark refreshes and authenticated community ranking writes to the SQLite checkpoint.

# Every release bumps package.json's version, so the dependency layers key on the manifest without it and stay cached between releases.
FROM node:24-bookworm-slim AS manifest
COPY package.json /manifest/package.json
RUN node -e "const fs = require('node:fs'); const manifest = JSON.parse(fs.readFileSync('/manifest/package.json', 'utf8')); delete manifest.version; fs.writeFileSync('/manifest/package.json', JSON.stringify(manifest));"

FROM node:24-bookworm-slim

ENV CI=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY --from=manifest /manifest/package.json ./package.json
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium

COPY . .
RUN pnpm run typecheck && pnpm run test

CMD ["pnpm", "run", "snapshot:publish"]
