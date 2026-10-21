-- migrate:up

-- Migration 023: caps on two tables one account could grow without bound, and the version an issue was fixed in (code audit 2026-10-21, S-03 and S-05).
--
-- refused_writes keeps every invalid write an account sent, for diagnosis. It had no retention, so an account sending invalid requests at the command rate
-- limit (600 a minute) could write a lot of rows that were never deleted. Now each insert trims that account's rows: only the newest 200 are kept, and none older
-- than 30 days. The trim runs in the insert's own transaction, so there is no job to schedule, and it only ever touches the inserting account's rows.
create function trim_refused_writes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from refused_writes
   where user_id = new.user_id
     and (received_at < now() - interval '30 days'
          or id in (select id from refused_writes where user_id = new.user_id order by received_at desc, id desc offset 200));
  return null;
end
$$;
revoke execute on function trim_refused_writes() from public;
create trigger refused_writes_trim after insert on refused_writes for each row execute function trim_refused_writes();

-- row_history copies the old row before every update, with no limit, so one document saved thousands of times kept thousands of copies. Now each row keeps
-- its latest 50 versions. The function was already security definer with search_path public (migration 20261008000002), which is what lets the trim delete rows the
-- app role has no grant on; it still writes and trims only the row's own user_id.
create or replace function record_row_history() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into row_history (user_id, table_name, row_id, version, data)
  values (old.user_id, tg_table_name, old.id, old.version, to_jsonb(old));
  delete from row_history
   where user_id = old.user_id and table_name = tg_table_name and row_id = old.id
     and id in (select id from row_history where user_id = old.user_id and table_name = tg_table_name and row_id = old.id order by version desc, id desc offset 50);
  return new;
end;
$$;

-- A "fixed" issue came back as "open" on any later report, including one from a phone still running the old version after the fix was deployed, so
-- stale clients kept reopening fixed issues. Now marking an issue fixed records the version that last reported it (fixed_version), and a report reopens it only
-- when it comes from a different, non-empty version. The reports still count either way. Issues already fixed take the version that last reported them.
alter table issues add column fixed_version text not null default '' check (length(fixed_version) <= 20);
update issues set fixed_version = last_version where status = 'fixed';

create or replace function record_issue(p_fingerprint text, p_kind text, p_message text, p_top_frame text, p_page text, p_version text)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  was_inserted boolean;
begin
  if not exists (select 1 from issues where fingerprint = p_fingerprint) then
    perform pg_advisory_xact_lock(hashtext('record_issue'));
    if (select count(*) from issues) >= 5000 then
      delete from issues where fingerprint = (select fingerprint from issues where occurrences = 1 and status = 'open' and note = '' order by last_seen limit 1);
      if not found then
        return 'full';
      end if;
    end if;
  end if;
  insert into issues as i (fingerprint, kind, message, top_frame, page, first_version, last_version)
    values (p_fingerprint, p_kind, p_message, p_top_frame, p_page, p_version, p_version)
    on conflict (fingerprint) do update set
      last_seen = now(),
      occurrences = i.occurrences + 1,
      page = excluded.page,
      last_version = excluded.last_version,
      status = case when i.status = 'fixed' and excluded.last_version <> '' and excluded.last_version <> i.fixed_version then 'open' else i.status end
    returning (xmax = 0) into was_inserted;
  return case when was_inserted then 'new' else 'repeat' end;
end
$$;

create or replace function set_issue_status(p_fingerprint text, p_status text, p_note text)
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from users where id = nullif(current_setting('app.user_id', true), '')::bigint and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('fixed', 'ignored', 'investigating', 'open') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  update issues
     set status = coalesce(p_status, status),
         note = coalesce(p_note, note),
         fixed_version = case when p_status = 'fixed' and status <> 'fixed' then last_version else fixed_version end
   where fingerprint = p_fingerprint;
  return found;
end
$$;

-- migrate:down

-- The whole migration is undone: the two caps go (rows already trimmed are gone for good, that data was only diagnostic), record_row_history is the version before this
-- one (security definer, search_path public, no trim), and record_issue and set_issue_status are their earlier definitions. fixed_version is dropped with its data.
drop trigger refused_writes_trim on refused_writes;
drop function trim_refused_writes();

create or replace function record_row_history() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into row_history (user_id, table_name, row_id, version, data)
  values (old.user_id, tg_table_name, old.id, old.version, to_jsonb(old));
  return new;
end;
$$;

create or replace function set_issue_status(p_fingerprint text, p_status text, p_note text)
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from users where id = nullif(current_setting('app.user_id', true), '')::bigint and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('fixed', 'ignored', 'investigating', 'open') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  update issues set status = coalesce(p_status, status), note = coalesce(p_note, note) where fingerprint = p_fingerprint;
  return found;
end
$$;

create or replace function record_issue(p_fingerprint text, p_kind text, p_message text, p_top_frame text, p_page text, p_version text)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  was_inserted boolean;
begin
  if not exists (select 1 from issues where fingerprint = p_fingerprint) then
    -- One new fingerprint at a time from here, so several callers cannot all pass the count below and overshoot the cap.
    perform pg_advisory_xact_lock(hashtext('record_issue'));
    if (select count(*) from issues) >= 5000 then
      -- Make room by dropping the oldest report nobody has acted on (seen once, still open, no note), so junk sent without a sign-in
      -- cannot keep real new problems out for good. If every row has been seen again or touched, say so.
      delete from issues where fingerprint = (select fingerprint from issues where occurrences = 1 and status = 'open' and note = '' order by last_seen limit 1);
      if not found then
        return 'full';
      end if;
    end if;
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

alter table issues drop column fixed_version;
