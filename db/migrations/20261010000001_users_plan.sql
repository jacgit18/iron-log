-- migrate:up

-- Which tier an account is on: beta (the alpha and beta testers), free, or paid. Nothing reads it yet except the admin; billing and
-- limits will. Every existing account is a beta account. Change one by hand: `update users set plan = 'free' where id = ...`
-- (the API role cannot, like is_admin).
alter table users add column plan text not null default 'beta' check (plan in ('beta', 'free', 'paid'));

-- migrate:down

alter table users drop column plan;
