# The parity job (scripts/env-parity.mjs): Node, the lockfile's production dependencies (pg is one) and the one script. Read-only: it
# gets a migrations_reader URL, never an owner URL. Built by scripts/parity-job.sh deploy (cloudbuild-parity.yaml).
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY scripts/env-parity.mjs ./scripts/env-parity.mjs
COPY scripts/lib/migration-state.mjs ./scripts/lib/migration-state.mjs
COPY scripts/lib/ssl-mode.mjs ./scripts/lib/ssl-mode.mjs
COPY scripts/lib/secret-names.mjs ./scripts/lib/secret-names.mjs
COPY scripts/secret-inventory.mjs ./scripts/secret-inventory.mjs
USER node
ENTRYPOINT ["node", "scripts/env-parity.mjs"]
