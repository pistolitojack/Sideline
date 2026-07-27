-- Phase 1.1: upload rate limiting (database backstop).
-- The app also checks this before letting a coach upload, but this trigger
-- enforces the cap of 3 sessions per coach per rolling 24 hours in the
-- database itself — so it can't be bypassed by refreshing or a private window.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

create or replace function enforce_session_rate_limit()
returns trigger as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from sessions
  where coach_id = NEW.coach_id
    and created_at > now() - interval '24 hours';
  if recent_count >= 3 then
    raise exception 'session_rate_limit: max 3 sessions per 24 hours';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists session_rate_limit on sessions;
create trigger session_rate_limit
  before insert on sessions
  for each row execute function enforce_session_rate_limit();

select 'upload rate limit ready' as result;
