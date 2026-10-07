create table if not exists public.bb_coupon_snapshots (
  id text primary key,
  created_at timestamptz not null,
  snapshot jsonb not null
);
alter table public.bb_coupon_snapshots enable row level security;
revoke all on public.bb_coupon_snapshots from anon, authenticated;
