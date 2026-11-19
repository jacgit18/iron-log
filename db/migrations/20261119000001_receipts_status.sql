-- migrate:up

-- Snap now, log later (brief receipt-snap-now-log-later): a saved receipt photo can wait unread. `to_log` is a photo snapped on a phone and not yet read or applied;
-- `logged` is every receipt that exists today (the default, so the existing rows and today's callers are unchanged). A later `read` (scan result cached) fits the
-- same column by widening the check, with no second migration. Expand only: one column with a default; row-level security, grants and the erase function are unchanged.
alter table receipts add column status text not null default 'logged' check (status in ('to_log', 'logged'));

-- migrate:down

-- Rollback: the photos stay (they become ordinary Receipts rows); only the label is lost.
alter table receipts drop column status;
