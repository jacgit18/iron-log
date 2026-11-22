-- migrate:up

-- Opt-in anonymous usage counts (brief opt-in-usage-counts). One row per install per UTC day. Not user data: no user_id, and install_hash is
-- an HMAC the server makes of the random id a phone made for itself, so a dump of this table cannot be matched to a phone or an account.
-- The app role has no grant and no policy; it reaches the table only through the security-definer functions below, like `issues`.
create table usage_days (
  install_hash text   not null check (install_hash ~ '^[0-9a-f]{64}$'),
  day          date   not null,
  version      text   not null default '' check (length(version) <= 20),
  from_app     boolean not null default false,
  counts       jsonb  not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  primary key (install_hash, day)
);

create index usage_days_day on usage_days (day);

alter table usage_days enable row level security;

-- Adds one day's counts for one install. The day is the server's UTC day; counts are summed into the day's row (a second send the same day
-- adds, it never replaces) and each is capped at 1000. Only the six counter names are accepted. Rows older than 90 days are dropped as new
-- rows arrive (a few at a time, so no job is needed), and the table holds at most 200,000 rows: a new install is refused with 'full'
-- (the server logs it) so a flood of junk, which takes no sign-in, cannot grow it without limit. Returns 'ok' or 'full'.
create function record_usage(p_hash text, p_version text, p_from_app boolean, p_counts jsonb)
  returns text
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad install' using errcode = '22023'; end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then raise exception 'bad counts' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_each(p_counts) e
             where e.key not in ('app_open', 'export_used', 'program_edited', 'push_on', 'sync_on', 'workout_logged')
                or jsonb_typeof(e.value) <> 'number' or (e.value)::text !~ '^[0-9]{1,4}$') then
    raise exception 'bad counts' using errcode = '22023';
  end if;
  if not exists (select 1 from usage_days where install_hash = p_hash and day = today) then
    perform pg_advisory_xact_lock(hashtext('record_usage'));
    delete from usage_days where ctid in (select ctid from usage_days where day < today - 90 limit 200);
    if (select count(*) from usage_days) >= 200000 then return 'full'; end if;
  end if;
  insert into usage_days as u (install_hash, day, version, from_app, counts)
    values (p_hash, today, left(coalesce(p_version, ''), 20), coalesce(p_from_app, false), p_counts)
    on conflict (install_hash, day) do update set
      version = excluded.version,
      from_app = u.from_app or excluded.from_app,
      counts = (
        select coalesce(jsonb_object_agg(k, least(coalesce((u.counts ->> k)::int, 0) + coalesce((excluded.counts ->> k)::int, 0), 1000)), '{}'::jsonb)
        from (select jsonb_object_keys(u.counts) as k union select jsonb_object_keys(excluded.counts)) ks
      );
  return 'ok';
end
$$;

-- The admin Usage screen's one read: per day the installs seen, how many came from the Android app, the share who came back 1, 7 and 14 days
-- after the first day they were seen, and feature counts per app version, for the last p_days (1 to 90). Refuses unless the caller
-- (app.user_id) has users.is_admin; the route checks requireAdmin too, the second lock, as for list_issues.
create function list_usage(p_days integer default 30)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'utc')::date;
  span integer := greatest(1, least(coalesce(p_days, 30), 90));
begin
  if not exists (select 1 from users where id = nullif(current_setting('app.user_id', true), '')::bigint and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'installs', d.installs, 'fromApp', d.from_app) order by d.day desc)
      from (select day, count(*) as installs, count(*) filter (where from_app) as from_app from usage_days where day > today - span group by day) d
    ), '[]'::jsonb),
    'retention', (
      select jsonb_agg(jsonb_build_object('after', n.n, 'eligible', r.eligible, 'returned', r.returned) order by n.n)
      from (values (1), (7), (14)) n(n)
      cross join lateral (
        select count(*) as eligible,
               count(*) filter (where exists (select 1 from usage_days u where u.install_hash = f.install_hash and u.day = f.first_day + n.n)) as returned
        from (select install_hash, min(day) as first_day from usage_days group by install_hash) f
        where f.first_day <= today - n.n
      ) r
    ),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('version', v.version, 'event', v.event, 'total', v.total) order by v.version desc, v.event)
      from (
        select version, e.key as event, sum((e.value)::int) as total
        from usage_days, jsonb_each_text(counts) e
        where day > today - span
        group by version, e.key
      ) v
    ), '[]'::jsonb),
    'installs', (select count(distinct install_hash) from usage_days where day > today - span)
  );
end
$$;

revoke execute on function record_usage(text, text, boolean, jsonb) from public;
revoke execute on function list_usage(integer) from public;
grant execute on function record_usage(text, text, boolean, jsonb) to ironlog_app;
grant execute on function list_usage(integer) to ironlog_app;

-- migrate:down

drop function list_usage(integer);
drop function record_usage(text, text, boolean, jsonb);
drop table usage_days;
