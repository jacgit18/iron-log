-- migrate:up

-- Migration 022: the admin Issues screen's way into `issues` (ADR 013 amendment, step 3). The app role still has no grant on the table;
-- these two security-definer functions are the only reads and writes it gets, and each refuses unless the caller (app.user_id,
-- set by inUserTransaction) has users.is_admin. The API also checks requireAdmin (the ADMIN_EMAILS list); this is the second lock, so a
-- route that forgot its check still cannot show or change an issue. A new admin therefore needs both set.
-- The list and the counts by status in one call (the screen needs both at once): { counts: { status: n }, issues: [...] }. The issues are
-- open first, then investigating, fixed, ignored, newest last-seen first, p_limit of them (1 to 200, default 100); the counts cover the whole table.
create function list_issues(p_status text default null, p_limit integer default 100)
  returns jsonb
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from users where id = nullif(current_setting('app.user_id', true), '')::bigint and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('fixed', 'ignored', 'investigating', 'open') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(c.status, c.n), '{}'::jsonb) from (select status, count(*) as n from issues group by status) c),
    'issues', coalesce((
      select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
      from (
        select i.*, row_number() over (order by case i.status when 'open' then 0 when 'investigating' then 1 when 'fixed' then 2 else 3 end, i.last_seen desc) as rn
        from issues i
        where p_status is null or i.status = p_status
        order by rn
        limit greatest(1, least(coalesce(p_limit, 100), 200))
      ) r
    ), '[]'::jsonb)
  );
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
revoke execute on function set_issue_status(text, text, text) from public;
grant execute on function list_issues(text, integer) to ironlog_app;
grant execute on function set_issue_status(text, text, text) to ironlog_app;

-- migrate:down

drop function set_issue_status(text, text, text);
drop function list_issues(text, integer);
