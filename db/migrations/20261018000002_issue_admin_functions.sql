-- migrate:up

-- Migration 022: the admin Issues screen's way into `issues` (ADR 013 amendment, step 3). The app role still has no grant on the table;
-- these three security-definer functions are the only reads and writes it gets, and each refuses unless the caller (app.user_id,
-- set by inUserTransaction) has users.is_admin. The API also checks requireAdmin (the ADMIN_EMAILS list); this is the second lock, so a
-- route that forgot its check still cannot show or change an issue. A new admin therefore needs both set.
create function list_issues(p_status text default null, p_limit integer default 100)
  returns setof issues
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from users where id = nullif(current_setting('app.user_id', true), '')::bigint and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('fixed', 'ignored', 'investigating', 'open') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  return query
    select * from issues
    where p_status is null or status = p_status
    order by case status when 'open' then 0 when 'investigating' then 1 when 'fixed' then 2 else 3 end, last_seen desc
    limit greatest(1, least(coalesce(p_limit, 100), 200));
end
$$;

create function issue_counts()
  returns table (status text, n bigint)
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from users where id = nullif(current_setting('app.user_id', true), '')::bigint and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select i.status, count(*) from issues i group by i.status;
end
$$;

-- Changes the status and/or the note of one issue (a null argument leaves that field as it is). Returns false when there is no such
-- fingerprint. Touching an issue also protects it from being dropped to make room (record_issue only drops open, unnoted, seen-once rows).
create function set_issue_status(p_fingerprint text, p_status text, p_note text)
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

revoke execute on function list_issues(text, integer) from public;
revoke execute on function issue_counts() from public;
revoke execute on function set_issue_status(text, text, text) from public;
grant execute on function list_issues(text, integer) to ironlog_app;
grant execute on function issue_counts() to ironlog_app;
grant execute on function set_issue_status(text, text, text) to ironlog_app;

-- migrate:down

drop function set_issue_status(text, text, text);
drop function issue_counts();
drop function list_issues(text, integer);
