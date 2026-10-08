# One image for the API and the PWA (ADR 010). Build: docker build -t iron-log .
# Run:   docker run --rm -p 8080:8080 -e DATABASE_URL=postgres://... iron-log
# Cloud Run sets PORT; locally it is 8080 unless you pass -e PORT=....

# --- Build the app and bundle the API ---------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
# The dependency layer is cached until package.json or the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The build's version is its commit time; the image has no git history, so it comes in as an argument:
#   docker build --build-arg APP_VERSION=$(git log -1 --format=%ct) -t iron-log .
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
# Syncing through the API is the point of this image, so the Cloud Build config turns the flag on for everyone (feature-flags.md);
# without the argument the build has it off, as the GitHub Pages build does.
ARG VITE_API_SYNC
ENV VITE_API_SYNC=$VITE_API_SYNC
# BASE_PATH is unset on purpose: the app is served from the root of its own origin.
RUN npm run build && npm run build:server

# --- Run: Node and two build outputs, nothing else ----------------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Not root.
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist-server/index.mjs"]
