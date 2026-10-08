# The nightly backup job (Phase F): the PostgreSQL 18 client tools (Neon runs 18) and curl, nothing else.
# Build: gcloud builds submit --config cloudbuild-backup.yaml (scripts/backup-cloud-run.sh does it).
FROM postgres:18-alpine
RUN apk add --no-cache curl
COPY backup/run.sh /run.sh
USER postgres
CMD ["/run.sh"]
