create table if not exists public.practice_progress (
  id text primary key,
  state jsonb not null default '{"days":{},"typeOverrides":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.practice_progress enable row level security;

drop policy if exists "Public can read practice progress" on public.practice_progress;
create policy "Public can read practice progress"
  on public.practice_progress for select to anon, authenticated using (true);

drop policy if exists "Public can insert practice progress" on public.practice_progress;
create policy "Public can insert practice progress"
  on public.practice_progress for insert to anon, authenticated with check (true);

drop policy if exists "Public can update practice progress" on public.practice_progress;
create policy "Public can update practice progress"
  on public.practice_progress for update to anon, authenticated using (true) with check (true);
