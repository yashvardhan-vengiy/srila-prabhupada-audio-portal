-- Srila Prabhupada Audio Portal - Supabase schema
-- Run this first in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.recordings (
  id text primary key,
  file_number text unique not null,
  category text,
  title text not null,
  verse text,
  lectured_date text,
  lectured_location text,
  filename text,
  drive_url text not null,
  drive_file_id text,
  direct_url text,
  embed_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_recording_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_id text not null references public.recordings(id) on delete cascade,
  status text not null default 'not-heard' check (status in ('not-heard', 'hearing', 'completed')),
  last_position_seconds numeric not null default 0,
  liked_points text not null default '',
  notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, recording_id)
);

create index if not exists recordings_category_idx on public.recordings(category);
create index if not exists recordings_file_number_idx on public.recordings(file_number);
create index if not exists user_recording_progress_user_idx on public.user_recording_progress(user_id);
create index if not exists user_recording_progress_status_idx on public.user_recording_progress(user_id, status);

alter table public.recordings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_recording_progress enable row level security;

-- Public catalogue can be read by anyone. Progress and notes remain private per user.
drop policy if exists "Anyone can read recordings" on public.recordings;
create policy "Anyone can read recordings"
  on public.recordings for select
  using (true);

-- Keep catalogue writes restricted to service role / project owner through SQL editor.
drop policy if exists "Only service role can insert recordings" on public.recordings;
create policy "Only service role can insert recordings"
  on public.recordings for insert
  with check (auth.role() = 'service_role');

drop policy if exists "Only service role can update recordings" on public.recordings;
create policy "Only service role can update recordings"
  on public.recordings for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Profiles: users can see and update only their own profile.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Progress: every devotee can access only his/her own progress and notes.
drop policy if exists "Users can read own progress" on public.user_recording_progress;
create policy "Users can read own progress"
  on public.user_recording_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress" on public.user_recording_progress;
create policy "Users can insert own progress"
  on public.user_recording_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on public.user_recording_progress;
create policy "Users can update own progress"
  on public.user_recording_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own progress" on public.user_recording_progress;
create policy "Users can delete own progress"
  on public.user_recording_progress for delete
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
