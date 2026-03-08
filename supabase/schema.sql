-- ============================================================
-- SyncBeat · Supabase Schema
-- Run this in your Supabase project: SQL Editor > New query
-- ============================================================

-- 1. Rooms table
create table if not exists public.rooms (
  id          uuid        default gen_random_uuid() primary key,
  code        varchar(6)  unique not null,
  owner_id    varchar(255) not null,
  audio_url   text,
  audio_name  text,
  sync_state  jsonb       default '{"isPlaying": false, "currentTime": 0, "updatedAt": null}'::jsonb,
  created_at  timestamptz default timezone('utc', now())
);

-- 2. Enable Row Level Security
alter table public.rooms enable row level security;

-- 3. Policies (no auth needed for MVP — anyone can read/write)
create policy "Public can read rooms"
  on public.rooms for select using (true);

create policy "Public can create rooms"
  on public.rooms for insert with check (true);

create policy "Public can update rooms"
  on public.rooms for update using (true);

-- 4. Enable Realtime on this table
alter publication supabase_realtime add table public.rooms;

-- 5. Auto-delete rooms older than 24 hours (optional — requires pg_cron extension)
-- Uncomment if you have pg_cron enabled in Supabase (Extensions > pg_cron)
--
-- select cron.schedule(
--   'delete-old-rooms',
--   '0 * * * *',
--   $$ delete from public.rooms where created_at < now() - interval '24 hours' $$
-- );


-- ============================================================
-- Storage bucket setup
-- Run AFTER creating the table above
-- ============================================================

-- Create the audio-files bucket (public read, authenticated upload)
insert into storage.buckets (id, name, public)
values ('audio-files', 'audio-files', true)
on conflict do nothing;

-- Allow anyone to upload audio files
create policy "Public can upload audio"
  on storage.objects for insert
  with check (bucket_id = 'audio-files');

-- Allow anyone to read audio files (bucket is public, but belt-and-suspenders)
create policy "Public can read audio"
  on storage.objects for select
  using (bucket_id = 'audio-files');

-- Allow anyone to update/replace audio files
create policy "Public can update audio"
  on storage.objects for update
  using (bucket_id = 'audio-files');
