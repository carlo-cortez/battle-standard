-- Durable, shared AI request quota.
--
-- Activate by setting AI_PERSISTENT_QUOTA=true on the server AFTER applying this
-- migration. Until then the server uses its in-memory limiter, and if this
-- function is missing or errors the server falls back to it automatically, so
-- deploying the server code before running this migration is safe.
--
-- The claim is performed by a SECURITY DEFINER function so it can count requests
-- across all users (for the optional global daily cap) without granting clients
-- any direct access to the ledger. The function keys off auth.uid(), never a
-- caller-supplied id, so a signed-in user can only ever claim against their own
-- quota.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx on public.ai_usage(user_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage(created_at desc);

alter table public.ai_usage enable row level security;
-- Clients never touch the table directly; all access goes through
-- claim_ai_request below. RLS with no policies already denies API access, and
-- the explicit revoke removes Supabase's default grants as defense in depth.
revoke all on table public.ai_usage from anon, authenticated;

create or replace function public.claim_ai_request(
  p_per_minute integer,
  p_per_hour integer,
  p_per_day_global integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_minute_count integer;
  v_hour_count integer;
  v_global_count integer;
  v_oldest_minute timestamptz;
  v_oldest_hour timestamptz;
  v_oldest_global timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'scope', 'hour', 'retry_after_seconds', 1, 'remaining', 0);
  end if;

  -- Serialize claims per user for the rest of this transaction so concurrent
  -- requests cannot both pass the count check. The global cap remains
  -- best-effort under heavy concurrency, which is acceptable for a backstop.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select count(*), min(created_at) into v_minute_count, v_oldest_minute
    from public.ai_usage where user_id = v_user and created_at > now() - interval '1 minute';
  if p_per_minute > 0 and v_minute_count >= p_per_minute then
    return jsonb_build_object(
      'allowed', false, 'scope', 'minute',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest_minute + interval '1 minute' - now()))))::int,
      'remaining', 0);
  end if;

  select count(*), min(created_at) into v_hour_count, v_oldest_hour
    from public.ai_usage where user_id = v_user and created_at > now() - interval '1 hour';
  if p_per_hour > 0 and v_hour_count >= p_per_hour then
    return jsonb_build_object(
      'allowed', false, 'scope', 'hour',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest_hour + interval '1 hour' - now()))))::int,
      'remaining', 0);
  end if;

  if p_per_day_global > 0 then
    select count(*), min(created_at) into v_global_count, v_oldest_global
      from public.ai_usage where created_at > now() - interval '1 day';
    if v_global_count >= p_per_day_global then
      return jsonb_build_object(
        'allowed', false, 'scope', 'day-global',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest_global + interval '1 day' - now()))))::int,
        'remaining', 0);
    end if;
  end if;

  insert into public.ai_usage(user_id) values (v_user);

  return jsonb_build_object(
    'allowed', true, 'scope', 'hour',
    'remaining', case when p_per_hour > 0 then greatest(0, p_per_hour - (v_hour_count + 1)) else 0 end);
end;
$$;

revoke all on function public.claim_ai_request(integer, integer, integer) from public, anon;
grant execute on function public.claim_ai_request(integer, integer, integer) to authenticated;
