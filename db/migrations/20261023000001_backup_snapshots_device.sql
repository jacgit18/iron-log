-- migrate:up

-- Backup device names (brief backup-device-names): the account backup of a day says which device wrote it, so a person with more than one
-- device can tell them apart. Expand only: a nullable column, no backfill (older rows and older app versions have no name).
alter table backup_snapshots add column device text check (device is null or char_length(device) between 1 and 40);

-- migrate:down

alter table backup_snapshots drop column device;
