-- migrate:up

-- Recorded acceptance of the Terms of Use and the Privacy Policy (brief terms-acceptance). Expand only: three nullable columns and one function;
-- nothing existing changes, so the code can ship after this has run. NULL means "never accepted": existing accounts are asked once on next open.
--   * terms_version / privacy_version: the `Version x.y` line of public/terms.html and public/privacy.html the person accepted (kept apart: they differ).
--   * terms_accepted_at: when. Only the latest acceptance is kept (no history table).
--   * accept_terms(): the one way to set them, for the calling account (session auth), like ensure_user_state. Idempotent: the same versions again
--     keep the first time stamp; a newer version replaces the old ones and stamps again.
alter table users add column terms_version text null;
alter table users add column privacy_version text null;
alter table users add column terms_accepted_at timestamptz null;

create function accept_terms(p_terms text, p_privacy text) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller bigint := nullif(current_setting('app.user_id', true), '')::bigint;
begin
  if caller is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_terms is null or p_privacy is null or p_terms !~ '^[0-9]{1,3}\.[0-9]{1,3}$' or p_privacy !~ '^[0-9]{1,3}\.[0-9]{1,3}$' then
    raise exception 'versions look like 1.3' using errcode = '22023';
  end if;
  update users
     set terms_version = p_terms,
         privacy_version = p_privacy,
         terms_accepted_at = case when terms_version = p_terms and privacy_version = p_privacy and terms_accepted_at is not null then terms_accepted_at else now() end
   where id = caller;
end
$$;
revoke all on function accept_terms(text, text) from public;
grant execute on function accept_terms(text, text) to ironlog_app;

-- migrate:down

-- Rollback forgets every recorded acceptance (everyone is asked again once the columns come back).
drop function accept_terms(text, text);
alter table users drop column terms_accepted_at;
alter table users drop column privacy_version;
alter table users drop column terms_version;
