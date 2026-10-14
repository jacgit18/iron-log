-- migrate:up

-- Migration 016: stop keeping where a session was made from. Better Auth stored the IP address and browser string of every session
-- (auth.session."ipAddress", "userAgent"); the app never reads them and an IP address is personal data. New sessions get null from a
-- database hook (server/auth/betterAuth.ts); this clears what was stored before. Nothing else changes; nobody is signed out.

update auth."session" set "ipAddress" = null, "userAgent" = null where "ipAddress" is not null or "userAgent" is not null;

-- migrate:down

-- The cleared values cannot be restored; the columns stay, empty.
select 1;
