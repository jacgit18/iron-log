-- migrate:up

-- Billing (ADR 065, brief billing-stripe-subscriptions): who set a user's plan and where their Stripe subscription stands. Expand only: every
-- new column is nullable or defaulted, the `plan` check is unchanged, and nothing reads them until the billing routes are configured.
--   plan_source      who last set `plan`: 'manual' (the owner, by hand; every row so far), 'stripe' (the webhook), 'play' (kept for a Play build)
--   plan_status      Stripe's subscription status (active, past_due, canceled, ...), for the Billing section
--   plan_renews_at   end of the paid period (the next renewal, or the day access ends when cancelled)
--   plan_updated_at  the Stripe event time of the last change, so an older event cannot undo a newer one
--   stripe_customer_id  the Stripe customer, set when a Checkout completes
alter table users
  add column plan_source text not null default 'manual' check (plan_source in ('manual', 'play', 'stripe')),
  add column plan_status text null check (length(plan_status) <= 40),
  add column plan_renews_at timestamptz null,
  add column plan_updated_at timestamptz null,
  add column stripe_customer_id text null check (length(stripe_customer_id) <= 100);

create unique index users_stripe_customer on users (stripe_customer_id) where stripe_customer_id is not null;

-- Stripe event ids already handled, so a delivery sent twice (Stripe retries) changes nothing the second time. No user data. Like `issues`
-- the app role has no grant and no policy: it reaches this table only through apply_subscription_event below.
create table stripe_events (
  event_id     text primary key check (length(event_id) <= 100),
  type         text not null check (length(type) <= 100),
  received_at  timestamptz not null default now()
);
alter table stripe_events enable row level security;

-- The webhook has no signed-in user and `users` is under row-level security, so this runs as the owner (the ensure_user pattern).
-- Returns 'duplicate' (event seen before), 'unknown' (no such user), 'linked' (customer id stored, plan untouched), 'stale' (an older
-- event than the last change), 'kept' (the plan is not one a subscription may change) or 'applied'.
-- The rule that a subscription never touches beta, lifetime or founder accounts lives here, not in the caller: only free and paid move.
-- p_plan null means "link the customer only" (checkout.session.completed carries no status).
create function apply_subscription_event(
  p_event_id text, p_type text, p_event_at timestamptz, p_user_id bigint, p_customer_id text,
  p_plan text, p_status text, p_renews_at timestamptz
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  u users%rowtype;
begin
  if p_plan is not null and p_plan not in ('free', 'paid') then
    raise exception 'a subscription may only set free or paid' using errcode = '22023';
  end if;
  if p_user_id is not null then
    select * into u from users where id = p_user_id for update;
  end if;
  if u.id is null and p_customer_id is not null then
    select * into u from users where stripe_customer_id = p_customer_id for update;
  end if;
  if u.id is null then
    return 'unknown'; -- dropped: the route answers 200 so Stripe does not resend it (a Stripe account can also hold subscriptions of other products). Checkout puts the user id on the session and the subscription, so a subscription made through Checkout always finds its user.
  end if;
  insert into stripe_events (event_id, type) values (p_event_id, p_type) on conflict (event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;
  if p_customer_id is not null and u.stripe_customer_id is null then
    update users set stripe_customer_id = p_customer_id where id = u.id;
  end if;
  if p_plan is null then
    return 'linked';
  end if;
  if u.plan not in ('free', 'paid') then
    return 'kept';
  end if;
  if u.plan_updated_at is not null and p_event_at < u.plan_updated_at then
    return 'stale';
  end if;
  update users
     set plan = p_plan, plan_source = 'stripe', plan_status = p_status, plan_renews_at = p_renews_at, plan_updated_at = p_event_at
   where id = u.id;
  return 'applied';
end
$$;
revoke all on function apply_subscription_event(text, text, timestamptz, bigint, text, text, text, timestamptz) from public;
grant execute on function apply_subscription_event(text, text, timestamptz, bigint, text, text, text, timestamptz) to ironlog_app;

-- migrate:down

drop function apply_subscription_event(text, text, timestamptz, bigint, text, text, text, timestamptz);
drop table stripe_events;
drop index users_stripe_customer;
alter table users
  drop column stripe_customer_id,
  drop column plan_updated_at,
  drop column plan_renews_at,
  drop column plan_status,
  drop column plan_source;
