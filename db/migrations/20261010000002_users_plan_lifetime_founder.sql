-- migrate:up

-- Two more tiers for early accounts, above paid and never billed: lifetime (an early user given everything for good) and founder (the
-- owner). Like the others, nothing reads them yet. Set by hand as the owner: `update users set plan = 'lifetime' where id = ...`.
alter table users drop constraint users_plan_check;
alter table users add constraint users_plan_check check (plan in ('beta', 'free', 'paid', 'lifetime', 'founder'));

-- migrate:down

update users set plan = 'beta' where plan in ('lifetime', 'founder');
alter table users drop constraint users_plan_check;
alter table users add constraint users_plan_check check (plan in ('beta', 'free', 'paid'));
