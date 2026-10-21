-- migrate:up

-- Audit 2026-10-21, S-3 and S-4: record_issue() (migration 20261021000001) reopened a fixed issue on any non-empty version different from fixed_version, so a
-- stale phone on an OLDER build, or an anonymous caller sending any other string, reopened it. The app version is the unix time in seconds of the build's commit
-- (vite.config.js), digits only. Now a fixed issue reopens only when the reported version is all digits (1 to 12), is greater than the fixed version (a fixed_version
-- that is empty or not a number counts as 0), and is not in the future (more than a day past the database clock), so a made-up huge number cannot reopen it.
-- A caller can still send a plausible recent number: the endpoint is anonymous, so this narrows the hole, it does not close it (the report is still counted either way).
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
      status = case
        when i.status = 'fixed'
          and excluded.last_version ~ '^[0-9]{1,12}$'
          and excluded.last_version::bigint > case when i.fixed_version ~ '^[0-9]{1,12}$' then i.fixed_version::bigint else 0 end
          and excluded.last_version::bigint <= extract(epoch from now())::bigint + 86400
        then 'open' else i.status end
    returning (xmax = 0) into was_inserted;
  return case when was_inserted then 'new' else 'repeat' end;
end
$$;

-- migrate:down

-- Back to the definition in 20261021000001: reopen on any different, non-empty version.
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
