-- migrate:up

-- Lets the fire route (which runs for Cloud Tasks, with no signed-in user, so row-level security shows it nothing) mark the NEXT water
-- reminder as wanted, the way /schedule does for a person (ADR 044, migration 019). Without the marker the queued task would find nothing to claim.
-- It sets the marker only when none is there (the fire route's own claim just cleared it), so a newer ask the phone made in between is never overwritten.
-- Function only: no table or column changes. Returns true when it set the marker.
create function push_rearm(p_id bigint, p_kind text, p_key text, p_at bigint)
  returns boolean
  language sql security definer set search_path = public as $$
  update push_subscription set pending = jsonb_set(pending, array[p_kind], jsonb_build_object('key', p_key, 'at', p_at))
   where id = p_id and not pending ? p_kind
  returning true
$$;

revoke all on function push_rearm(bigint, text, text, bigint) from public;
grant execute on function push_rearm(bigint, text, text, bigint) to ironlog_app;

-- migrate:down

revoke execute on function push_rearm(bigint, text, text, bigint) from ironlog_app;
drop function push_rearm(bigint, text, text, bigint);
