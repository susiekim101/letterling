alter table public.sessions
add column if not exists host_last_seen_at timestamptz;

create index if not exists sessions_host_last_seen_at_idx
on public.sessions (host_last_seen_at);
