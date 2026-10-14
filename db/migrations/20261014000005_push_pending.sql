-- migrate:up

-- Migration 019: what is waiting to be sent, and the three things the send route may do without a signed-in user (ADR 044, PR 4).
-- Cloud Tasks cannot take a task back cheaply (and a deleted task's name cannot be reused for days), so the truth about "is this send
-- still wanted" lives in the row: `pending` = { "<kind>": { "key": ..., "at": ... } }. Scheduling sets it, cancelling or scheduling again
-- changes it, and the task, when it fires, sends only if it still matches (and clears it, so a retry sends nothing twice).
alter table push_subscription add column pending jsonb not null default '{}' check (jsonb_typeof(pending) = 'object');

-- The send route runs for Cloud Tasks, not for a person, so there is no app.user_id and row-level security would show it nothing.
-- These owner-run functions are the only way in: claim a send (returns the keys to send with, once), note it worked, drop a dead one.
create function push_claim(p_id bigint, p_kind text, p_key text, p_at bigint)
  returns table (endpoint text, p256dh text, auth text)
  language sql security definer set search_path = public as $$
  update push_subscription s set pending = s.pending - p_kind
   where s.id = p_id and s.pending -> p_kind ->> 'key' = p_key and (s.pending -> p_kind ->> 'at')::bigint = p_at
  returning s.endpoint, s.p256dh, s.auth
$$;

create function push_sent(p_id bigint) returns void
  language sql security definer set search_path = public as $$
  update push_subscription set last_ok_at = now() where id = p_id
$$;

-- A push service answered 404 or 410: the browser is gone for good.
create function push_gone(p_id bigint) returns void
  language sql security definer set search_path = public as $$
  delete from push_subscription where id = p_id
$$;

revoke all on function push_claim(bigint, text, text, bigint) from public;
revoke all on function push_sent(bigint) from public;
revoke all on function push_gone(bigint) from public;
grant execute on function push_claim(bigint, text, text, bigint) to ironlog_app;
grant execute on function push_sent(bigint) to ironlog_app;
grant execute on function push_gone(bigint) to ironlog_app;

-- migrate:down

revoke execute on function push_gone(bigint) from ironlog_app;
revoke execute on function push_sent(bigint) from ironlog_app;
revoke execute on function push_claim(bigint, text, text, bigint) from ironlog_app;
drop function push_gone(bigint);
drop function push_sent(bigint);
drop function push_claim(bigint, text, text, bigint);
alter table push_subscription drop column pending;
