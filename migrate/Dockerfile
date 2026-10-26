# The production migrate job (scripts/migrate-run.mjs): Node, the production dependencies (pg), dbmate and the few scripts it reuses. It holds the production
# OWNER login at run time only (Secret Manager, mounted by the job); the CI deployer can start it but not read that login or change the job.
# Built by scripts/migrate-job.sh deploy (cloudbuild-migrate.yaml). dbmate is a development dependency of the app, so it is copied from a full
# install in a build stage; the install uses the lockfile and runs no install scripts.
FROM node:22-slim AS tools
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=tools /app/node_modules/dbmate ./node_modules/dbmate
COPY --from=tools /app/node_modules/@dbmate ./node_modules/@dbmate
RUN mkdir -p node_modules/.bin && ln -s ../dbmate/dist/cli.js node_modules/.bin/dbmate && chmod +x node_modules/dbmate/dist/cli.js
COPY scripts/migrate-run.mjs ./scripts/migrate-run.mjs
COPY scripts/migration-guard.mjs ./scripts/migration-guard.mjs
COPY scripts/same-database.mjs ./scripts/same-database.mjs
COPY scripts/lib/db-script.mjs ./scripts/lib/db-script.mjs
COPY scripts/lib/migration-state.mjs ./scripts/lib/migration-state.mjs
COPY scripts/lib/ssl-mode.mjs ./scripts/lib/ssl-mode.mjs
USER node
ENTRYPOINT ["node", "scripts/migrate-run.mjs"]
