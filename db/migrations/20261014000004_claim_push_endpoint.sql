-- migrate:up

-- Migration 018: one browser endpoint belongs to one account (ADR 044, PR 3). Row-level security hides other accounts' rows, so when a
-- second person signs in on a shared phone and turns push on, the app cannot see (or remove) the first person's row for the same
-- endpoint. This owner-run function removes every other account's row for the endpoint, and only for the signed-in user.
create function claim_push_endpoint(p_endpoint text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid bigint := nullif(current_setting('app.user_id', true), '')::bigint;
begin
  if uid is null then raise exception 'claim_push_endpoint: no signed-in user'; end if;
  delete from push_subscription where endpoint = p_endpoint and user_id <> uid;
end
$$;

revoke all on function claim_push_endpoint(text) from public;
grant execute on function claim_push_endpoint(text) to ironlog_app;

-- migrate:down

revoke execute on function claim_push_endpoint(text) from ironlog_app;
drop function claim_push_endpoint(text);
