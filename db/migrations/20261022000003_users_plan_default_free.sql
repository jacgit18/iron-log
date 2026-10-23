-- migrate:up

-- New accounts start on free, not beta (billing go-live, ADR 065, brief billing-go-live). Beta was the alpha testers' plan, and a beta account
-- cannot subscribe: Checkout refuses it and the Stripe webhook never changes it. Expand only: the default changes, no existing row is touched
-- (the owner moves the existing beta accounts with `scripts/prod-db.sh beta-to-free`), and `beta` stays an allowed value.
alter table users alter column plan set default 'free';

-- migrate:down

alter table users alter column plan set default 'beta';
