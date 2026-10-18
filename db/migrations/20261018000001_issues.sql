-- migrate:up

-- Migration 021: production issues (ADR 013 amendment). One row per fingerprint of a scrubbed error report, so repeats are counted
-- and a first-ever report can be told from the hundredth. Not user data: no user_id, and only text that server/clientErrors.ts has
-- already scrubbed (digits masked, no emails or tokens). The app role has no grant and no policy, so it can read and write this table
-- only through the security-definer functions below; the admin screen's functions come in a later migration.
create table issues (
  fingerprint    text primary key check (fingerprint ~ '^[0-9a-f]{12}$'),
  kind           text not null check (kind in ('error', 'unhandledrejection', 'server', 'sync')),
  message        text not null check (length(message) <= 300),
  top_frame      text not null default '' check (length(top_frame) <= 160),
  page           text not null default '' check (length(page) <= 120),
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  occurrences    bigint not null default 1,
  first_version  text not null default '' check (length(first_version) <= 20),
  last_version   text not null default '' check (length(last_version) <= 20),
  status         text not null default 'open' check (status in ('fixed', 'ignored', 'investigating', 'open')),
  note           text not null default '' check (length(note) <= 2000)
);

create index issues_last_seen on issues (last_seen desc);

alter table issues enable row level security;

-- Counts one report. Returns 'new' for a fingerprint not seen before, 'repeat' for one that was, and 'full' when a new fingerprint was
-- refused because the table is at its cap (the caller logs that, so a full table is noticed). A fixed issue that
-- comes back is opened again, so a regression is not hidden. The 5000-row cap stops anyone sending endless different messages
-- (the endpoint takes reports without a sign-in) from filling the table.
create function record_issue(p_fingerprint text, p_kind text, p_message text, p_top_frame text, p_page text, p_version text)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  was_inserted boolean;
begin
  if not exists (select 1 from issues where fingerprint = p_fingerprint) and (select count(*) from issues) >= 5000 then
    return 'full';
  end if;
  insert into issues as i (fingerprint, kind, message, top_frame, page, first_version, last_version)
    values (p_fingerprint, p_kind, p_message, p_top_frame, p_page, p_version, p_version)
    on conflict (fingerprint) do update set
      last_seen = now(),
      occurrences = i.occurrences + 1,
      page = excluded.page,
      last_version = excluded.last_version,
      status = case when i.status = 'fixed' then 'open' else i.status end
    returning (xmax = 0) into was_inserted;
  return case when was_inserted then 'new' else 'repeat' end;
end
$$;

revoke execute on function record_issue(text, text, text, text, text, text) from public;
grant execute on function record_issue(text, text, text, text, text, text) to ironlog_app;

-- migrate:down

drop function record_issue(text, text, text, text, text, text);
drop table issues;
